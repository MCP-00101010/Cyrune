const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'Portal');
const source = fs.readFileSync(path.join(__dirname, 'football-tracker-widget.js'), 'utf8');

function createContext(extra = {}) {
  const cache = new Map();
  const context = vm.createContext({
    WIDGET_REGISTRY: {}, Map, Set, Object, String, Number, Date, Math, Promise, URL,
    getServiceSecret: name => ({ footballData: 'football-data-token', sportmonks: 'sportmonks-token', apiFootball: 'api-football-key' })[name] || '',
    _refreshWidget() {},
    WidgetSDK: {
      cache: {
        get: (type, id, key) => cache.get(`${type}:${id}:${key}`) || null,
        set: (type, id, key, value) => cache.set(`${type}:${id}:${key}`, JSON.parse(JSON.stringify(value))),
        remove: (type, id, key) => cache.delete(`${type}:${id}:${key}`)
      },
      extensionRelay: { invoke: async () => { throw new Error('relay unavailable'); } }
    },
    ...extra
  });
  context.__cache = cache;
  vm.runInContext(source, context);
  return context;
}

function widget(config = {}) {
  return { id: 'football-1', type: 'widget', widgetType: 'footballTracker', config: { competitionCode: 'PL', defaultView: 'matches', showCrests: true, favouriteTeam: '', favouriteTeams: [], ...config }, data: {} };
}

test('competition catalogue maps all tracked UEFA club competitions to TheSportsDB', () => {
  const context = createContext();
  const competitions = vm.runInContext('FOOTBALL_TRACKER_COMPETITIONS.map(({ area, code, kind, theSportsDbLeagueId, theSportsDbFallback }) => ({ area, code, kind, theSportsDbLeagueId, theSportsDbFallback }))', context);
  assert.ok([...competitions].some(entry => entry.code === 'PL' && entry.area === 'England'));
  assert.ok([...competitions].some(entry => entry.code === 'BL1' && entry.area === 'Germany'));
  assert.deepEqual([...competitions].filter(entry => entry.area === 'Europe' && entry.theSportsDbFallback).map(entry => [entry.code, entry.theSportsDbLeagueId]), [['CL', 4480], ['EUR-EL', 4481], ['EUR-ECL', 5071]]);
});

test('legacy Scottish Premier League labels canonicalize to the current Premiership', () => {
  const context = createContext();
  context.competition = { id: 4330, name: 'Scottish Premier League', area: 'Scotland', provider: 'theSportsDb' };
  const canonical = vm.runInContext('_footballTrackerCanonicalCompetition(competition)', context);
  assert.equal(canonical.key, 'SCO-PL');
  assert.equal(canonical.name, 'Premiership');
});

test('English Premier League provider labels canonicalize into one competition', () => {
  const context = createContext();
  context.competitions = [
    { id: 4328, name: 'English Premier League', area: '', provider: 'theSportsDb' },
    { id: 39, name: 'English Premiere League', area: 'England', provider: 'apiFootball' },
    { id: 2021, code: 'PL', name: 'Premier League', area: 'England', provider: 'footballData' }
  ];
  const canonical = vm.runInContext('competitions.map(_footballTrackerCanonicalCompetition)', context);
  assert.deepEqual([...canonical].map(entry => entry.key), ['PL', 'PL', 'PL']);
  assert.deepEqual([...canonical].map(entry => entry.name), ['Premier League', 'Premier League', 'Premier League']);
});

test('all configured competitions canonicalize their audited TheSportsDB identities', () => {
  const context = createContext();
  context.identities = [
    ['PL', 4328, 'English Premier League'], ['ELC', 4329, 'English League Championship'], ['ENG-FAC', 4482, 'FA Cup'], ['ENG-LC', 4570, 'EFL Cup'],
    ['SCO-PL', 4330, 'Scottish Premier League'], ['SCO-FAC', 4723, 'Scottish FA Cup'], ['SCO-LC', 4888, 'Scottish League Cup'],
    ['BL1', 4331, 'German Bundesliga'], ['DEU-DFB', 4485, 'DFB-Pokal'], ['PD', 4335, 'Spanish La Liga'], ['ESP-CDR', 4483, 'Copa del Rey'],
    ['SA', 4332, 'Italian Serie A'], ['ITA-CIT', 4506, 'Coppa Italia'], ['FL1', 4334, 'French Ligue 1'], ['FRA-CDF', 4484, 'Coupe de France'],
    ['DED', 4337, 'Dutch Eredivisie'], ['NLD-KNV', 4902, 'Dutch KNVB Cup'], ['PPL', 4344, 'Portuguese Primeira Liga'], ['PRT-TDP', 4510, 'Taca de Portugal'],
    ['DNK-SL', 4340, 'Danish Superliga'], ['CL', 4480, 'UEFA Champions League'], ['EUR-EL', 4481, 'UEFA Europa League'],
    ['EUR-ECL', 5071, 'UEFA Conference League'], ['EC', 4502, 'UEFA European Championships'], ['WC', 4429, 'FIFA World Cup']
  ];
  const canonical = vm.runInContext("identities.map(([expected, id, name]) => ({ expected, actual: _footballTrackerCanonicalCompetition({ id, name, provider: 'theSportsDb' }).key }))", context);
  assert.deepEqual([...canonical].map(entry => [entry.expected, entry.actual]), [...context.identities].map(([code]) => [code, code]));
});

test('provider priority keeps free coverage ahead of API-Football', () => {
  const context = createContext();
  context.codes = ['PL', 'SCO-PL', 'DEU-DFB', 'ENG-FAC', 'SCO-FAC', 'EC', 'WC'];
  const providers = vm.runInContext('Object.fromEntries(codes.map(code => { const competition = _footballTrackerCompetition(code); return [code, competition.provider]; }))', context);
  assert.deepEqual(JSON.parse(JSON.stringify(providers)), {
    PL: 'footballData', 'SCO-PL': 'sportmonks', 'DEU-DFB': 'apiFootball', 'ENG-FAC': 'apiFootball', 'SCO-FAC': 'apiFootball', EC: 'footballData', WC: 'footballData'
  });
});

test('match normalization keeps bounded display data and full-time scores', () => {
  const context = createContext();
  context.payload = { matches: [{ id: 7, utcDate: '2026-08-21T19:00:00Z', status: 'FINISHED', matchday: 3, stage: 'REGULAR_SEASON', homeTeam: { id: 1, name: 'Home FC', shortName: 'Home', crest: 'https://crests.football-data.org/1.png' }, awayTeam: { id: 2, name: 'Away FC' }, score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }] };
  const matches = vm.runInContext('_footballTrackerMatches(payload)', context);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].home.name, 'Home FC');
  assert.equal(matches[0].home.lookupName, 'Home FC');
  assert.equal(matches[0].homeScore, 2);
  assert.equal(matches[0].awayScore, 1);
  assert.equal(matches[0].matchday, 3);
  context.payload.matches[0].status = 'TIMED';
  context.payload.matches[0].score.fullTime = { home: null, away: null };
  const scheduled = vm.runInContext('_footballTrackerMatches(payload)', context);
  assert.equal(scheduled[0].status, 'SCHEDULED');
  assert.equal(scheduled[0].homeScore, null);
  assert.equal(scheduled[0].awayScore, null);
});

test('shared team normalization keeps complete provider names across every adapter', () => {
  const context = createContext();
  context.teams = [
    { id: 1, name: 'FC Bayern München', shortName: 'Bayern', provider: 'footballData' },
    { id: 2, name: 'FC Schalke 04', shortName: 'Schalke', provider: 'apiFootball' },
    { id: 3, name: 'Borussia Dortmund', shortName: 'Dortmund', provider: 'theSportsDb' },
    { id: 4, name: 'Paris Saint-Germain FC', shortName: 'PSG', provider: 'sportmonks' }
  ];
  const teams = vm.runInContext('teams.map(team => _footballTrackerTeam(team))', context);
  assert.deepEqual([...teams].map(team => team.name), [
    'FC Bayern München',
    'FC Schalke 04',
    'Borussia Dortmund',
    'Paris Saint-Germain FC'
  ]);
  assert.deepEqual([...teams].map(team => team.lookupName), [...teams].map(team => team.name));
  context.heart = { id: 5, name: 'Hearts', provider: 'sportmonks' };
  assert.equal(vm.runInContext('_footballTrackerTeam(heart).name', context), 'Heart of Midlothian');
  assert.equal(vm.runInContext("_footballTrackerComparableTeamName('Hearts') === _footballTrackerComparableTeamName('Heart of Midlothian')", context), true);
});

test('current football season rolls over in July', () => {
  const context = createContext();
  context.january = Date.parse('2027-01-15T12:00:00Z'); context.august = Date.parse('2027-08-15T12:00:00Z');
  assert.equal(vm.runInContext('_footballTrackerSeasonYear(january)', context), 2026);
  assert.equal(vm.runInContext('_footballTrackerSeasonYear(august)', context), 2027);
});

test('league rounds group by matchday while Champions League groups by calendar day', () => {
  const context = createContext();
  context.matches = [
    { utcDate: Date.parse('2026-09-15T17:00:00Z'), matchday: 1, status: 'SCHEDULED' },
    { utcDate: Date.parse('2026-09-15T20:00:00Z'), matchday: 1, status: 'SCHEDULED' },
    { utcDate: Date.parse('2026-09-16T20:00:00Z'), matchday: 2, status: 'SCHEDULED' }
  ];
  const league = vm.runInContext("_footballTrackerRounds(matches, _footballTrackerCompetition('PL'))", context);
  const championsLeague = vm.runInContext("_footballTrackerRounds(matches, _footballTrackerCompetition('CL'))", context);
  assert.deepEqual([...league].map(round => round.key), ['1', '2']);
  assert.deepEqual([...championsLeague].map(round => round.key), ['2026-09-15', '2026-09-16']);
});

test('current-round selection prefers live play and then the next scheduled round', () => {
  const context = createContext();
  context.rounds = [
    { key: '1', matches: [{ status: 'FINISHED', utcDate: 1000 }] },
    { key: '2', matches: [{ status: 'IN_PLAY', utcDate: 2000 }] },
    { key: '3', matches: [{ status: 'SCHEDULED', utcDate: 3000 }] }
  ];
  assert.equal(vm.runInContext('_footballTrackerDefaultRound(rounds, 2500).key', context), '2');
  context.rounds[1].matches[0].status = 'FINISHED';
  assert.equal(vm.runInContext('_footballTrackerDefaultRound(rounds, 2500).key', context), '3');
});

test('table favourites migrate the legacy highlight and support multiple exact teams', () => {
  let saves = 0; const context = createContext({ saveState: () => { saves += 1; } });
  context.widget = widget({ favouriteTeam: 'Celtic' }); context.team = { id: 53, name: 'Celtic' }; context.other = { id: 54, name: 'Rangers' };
  const migrated = vm.runInContext('_footballTrackerConfig(widget)', context);
  assert.equal(migrated.favouriteTeam, '');
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.favouriteTeams)), [{ id: 0, name: 'Celtic', provider: '' }]);
  assert.equal(vm.runInContext('_footballTrackerFavourite(widget, team)', context), true);
  assert.equal(vm.runInContext('_footballTrackerToggleFavourite(widget, other)', context), true);
  assert.equal(context.widget.config.favouriteTeams.length, 2);
  assert.equal(vm.runInContext('_footballTrackerToggleFavourite(widget, team)', context), false);
  assert.deepEqual([...context.widget.config.favouriteTeams].map(entry => entry.name), ['Rangers']);
  assert.equal(saves, 2);
});

test('football view, round and team-history navigation survive runtime recreation', () => {
  const context = createContext(); context.widget = widget({ competitionCode: 'SCO-PL' });
  const restored = vm.runInContext(`(() => {
    const first = _footballTrackerState(widget);
    first.view = 'standings'; first.roundKey = 'round-4'; first.historyTabKey = 'CL'; first.historySort = 'oldest';
    first.selectedTeam = { id: 53, name: 'Celtic', lookupName: 'Celtic FC', crest: 'https://example.test/celtic.png', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
    _footballTrackerWriteView(widget, first);
    _footballTrackerRuntime.clear(); _footballTrackerViewMemory.clear();
    const next = _footballTrackerState(widget);
    return { view: next.view, roundKey: next.roundKey, historyTabKey: next.historyTabKey, historySort: next.historySort, selectedTeam: next.selectedTeam };
  })()`, context);
  assert.equal(restored.view, 'standings');
  assert.equal(restored.roundKey, 'round-4');
  assert.equal(restored.historyTabKey, 'CL');
  assert.equal(restored.historySort, 'oldest');
  assert.equal(restored.selectedTeam.name, 'Celtic FC');
  assert.equal(restored.selectedTeam.lookupName, 'Celtic FC');
  assert.equal(context.__cache.has('footballTracker:football-1:view'), true);
  assert.deepEqual(context.widget.data, {});
});

test('legacy selected teams without a full lookup identity are not restored', () => {
  const context = createContext(); context.widget = widget({ competitionCode: 'BL1' });
  vm.runInContext("WidgetSDK.cache.set('footballTracker', widget.id, 'view', { competitionCode: 'BL1', view: 'matches', selectedTeam: { id: 5, name: 'Bayern', provider: 'footballData', area: 'Germany', competitionCode: 'BL1' } });", context);
  assert.equal(vm.runInContext('_footballTrackerState(widget).selectedTeam', context), null);
});

test('team history sorts newest first by default and can reverse without mutating provider data', () => {
  const context = createContext();
  context.matches = [{ id: 1, utcDate: Date.parse('2026-08-01T12:00:00Z') }, { id: 2, utcDate: Date.parse('2026-08-20T12:00:00Z') }];
  assert.deepEqual([...vm.runInContext("_footballTrackerSortHistoryMatches(matches, 'newest').map(match => match.id)", context)], [2, 1]);
  assert.deepEqual([...vm.runInContext("_footballTrackerSortHistoryMatches(matches, 'oldest').map(match => match.id)", context)], [1, 2]);
  assert.deepEqual([...context.matches].map(match => match.id), [1, 2]);
});

test('team history limits upcoming fixtures by count and migrates legacy day windows', () => {
  const context = createContext();
  context.widget = widget(); context.now = Date.parse('2026-09-01T12:00:00Z');
  context.matches = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, utcDate: context.now + (12 - index) * 86400000 }));
  const defaultLimit = vm.runInContext('_footballTrackerVisibleUpcoming(widget, matches, now)', context);
  assert.deepEqual([...defaultLimit].map(match => match.id), [12, 11, 10, 9, 8]);
  context.widget.config.historyUpcomingLimit = 10;
  assert.equal(vm.runInContext('_footballTrackerVisibleUpcoming(widget, matches, now).length', context), 10);
  context.widget.config.historyUpcomingLimit = 0;
  assert.equal(vm.runInContext('_footballTrackerVisibleUpcoming(widget, matches, now).length', context), 12);
  context.legacy = widget({ historyUpcomingDays: 30 });
  assert.equal(vm.runInContext('_footballTrackerConfig(legacy).historyUpcomingLimit', context), 5);
  assert.equal(Object.hasOwn(context.legacy.config, 'historyUpcomingDays'), false);
  context.legacyAll = widget({ historyUpcomingDays: 0 });
  assert.equal(vm.runInContext('_footballTrackerConfig(legacyAll).historyUpcomingLimit', context), 0);
});

test('team history hides only genuinely empty competition tabs under fixture limits', () => {
  const context = createContext();
  const now = Date.parse('2026-09-01T12:00:00Z');
  context.widget = widget({ historyUpcomingLimit: 5 }); context.now = now;
  context.groups = [
    { key: 'SCO-PL', matches: [{ utcDate: now - 86400000 }], upcoming: [] },
    { key: 'EUR-ECL', matches: [], upcoming: [{ utcDate: now + 45 * 86400000 }] },
    { key: 'SCO-LC', matches: [], upcoming: [{ utcDate: now + 10 * 86400000 }] },
    { key: 'EMPTY', matches: [], upcoming: [] }
  ];
  const visible = vm.runInContext('_footballTrackerVisibleHistoryGroups(widget, groups, now)', context);
  assert.deepEqual([...visible].map(group => group.key), ['SCO-PL', 'EUR-ECL', 'SCO-LC']);
});

test('standings retain total tables and discard redundant home/away tables', () => {
  const context = createContext();
  context.payload = { standings: [
    { type: 'TOTAL', stage: 'REGULAR_SEASON', table: [{ position: 1, team: { name: 'Leaders' }, playedGames: 4, goalDifference: 8, points: 12 }] },
    { type: 'HOME', stage: 'REGULAR_SEASON', table: [{ position: 1, team: { name: 'Home leaders' }, points: 6 }] }
  ] };
  const standings = vm.runInContext('_footballTrackerStandings(payload)', context);
  assert.equal(standings.length, 1);
  assert.equal(standings[0].table[0].team.name, 'Leaders');
  assert.equal(standings[0].table[0].points, 12);
});

test('provider request uses the global token and bounded SDK network route', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ matches: [] }) }; }
  });
  context.widget = widget();
  const payload = await vm.runInContext("_footballTrackerProviderRequest(widget, _footballTrackerCompetition('PL'), 'competitions/PL/matches')", context);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), { matches: [] });
  assert.equal(requests[0].options.headers['X-Auth-Token'], 'football-data-token');
  assert.equal(requests[0].options.widgetType, 'footballTracker');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.redirect, 'error');
});

test('annual football-data.org competitions request and cache the explicit current season', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => { requests.push(url); return { ok: true, json: async () => ({ matches: [] }) }; }
  });
  context.codes = ['PL', 'ELC', 'BL1', 'PD', 'SA', 'FL1', 'DED', 'PPL', 'CL']; context.widget = widget();
  await vm.runInContext("Promise.all(codes.map(code => _footballTrackerCompetitionPayload(widget, _footballTrackerCompetition(code), 'matches')))", context);
  for (const code of context.codes) assert.ok(requests.some(url => url.endsWith(`/competitions/${code}/matches?season=2026`)), `${code} should select season 2026`);
  assert.equal(vm.runInContext("_footballTrackerCacheKey(_footballTrackerCompetition('PL'), 'matches')", context), 'footballData:PL:matches:season:2026:team-identity:6');
  assert.equal(vm.runInContext("_footballTrackerCacheKey(_footballTrackerCompetition('CL'), 'matches')", context), 'footballData:CL:matches:season:2026:coverage:4:team-identity:6');
});

test('non-annual international tournaments retain provider-managed seasons', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => { requests.push(url); return { ok: true, json: async () => ({ matches: [] }) }; }
  });
  context.codes = ['EC', 'WC']; context.widget = widget();
  await vm.runInContext("Promise.all(codes.map(code => _footballTrackerCompetitionPayload(widget, _footballTrackerCompetition(code), 'matches')))", context);
  assert.ok(requests.some(url => url.endsWith('/competitions/EC/matches')));
  assert.ok(requests.some(url => url.endsWith('/competitions/WC/matches')));
  assert.ok(requests.every(url => !url.includes('?season=')));
});

test('Champions League tracker falls back to current TheSportsDB events on provider rejection', async () => {
  const requests = [];
  const event = (id, season, date, home, away, homeScore, awayScore, status) => ({
    idEvent: String(id), strTimestamp: `${date}T19:00:00`, dateEvent: date, strStatus: status, strSeason: season, idLeague: '4480', strLeague: 'UEFA Champions League',
    idHomeTeam: String(id + 1), strHomeTeam: home, intHomeScore: homeScore, idAwayTeam: String(id + 2), strAwayTeam: away, intAwayScore: awayScore
  });
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('api.football-data.org')) return { ok: false, status: 404, json: async () => ({ message: 'Season unavailable' }) };
      if (url.includes('/eventspastleague.php')) return { ok: true, json: async () => ({ events: [
        event(1, '2025-2026', '2026-05-30', 'Old FC', 'Previous FC', '2', '1', 'FT'),
        event(2, '2026-2027', '2026-08-19', 'Slovan Bratislava', 'Celje', '1', '1', 'FT')
      ] }) };
      if (url.includes('/eventsnextleague.php')) return { ok: true, json: async () => ({ events: [event(3, '2026-2027', '2026-08-25', 'Sabah Baku', "Hapoel Be'er Sheva", null, null, 'NS')] }) };
      if (url.includes('/eventsday.php?d=2026-08-19&l=4480')) return { ok: true, json: async () => ({ events: [
        event(4, '2026-2027', '2026-08-19', 'Celtic', 'LASK', '3', '0', 'FT'),
        event(5, '2026-2027', '2026-08-19', 'NEC Nijmegen', 'Bodø/Glimt', '1', '3', 'FT'),
        event(6, '2025-2026', '2026-08-19', 'Wrong Season', 'Old Season', '1', '0', 'FT')
      ] }) };
      if (url.includes('/eventsday.php?d=2026-08-25&l=4480')) return { ok: true, json: async () => ({ events: [event(3, '2026-2027', '2026-08-25', 'Sabah Baku', "Hapoel Be'er Sheva", null, null, 'NS')] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'CL' }); context.event = event;
  const matches = await vm.runInContext("_footballTrackerLoad(widget, 'matches')", context);
  assert.equal(matches.length, 4);
  assert.ok(matches.every(match => match.utcDate >= Date.parse('2026-07-01T00:00:00Z')));
  assert.ok(matches.some(match => match.home.name === 'Celtic' && match.away.name === 'LASK'));
  assert.equal(vm.runInContext("_footballTrackerState(widget).providers.matches", context), 'theSportsDb');
  assert.equal(vm.runInContext("_footballTrackerState(widget).errors.matches", context), '');
  assert.ok(requests.some(url => url.includes('/eventspastleague.php?id=4480')));
  assert.ok(requests.some(url => url.includes('/eventsnextleague.php?id=4480')));
  assert.ok(requests.some(url => url.includes('/eventsday.php?d=2026-08-19&l=4480')));
});

test('API-Football cup trackers use their audited TheSportsDB fallbacks', async () => {
  for (const [code, leagueId, leagueName] of [
    ['ENG-FAC', 4482, 'FA Cup'], ['DEU-DFB', 4485, 'DFB-Pokal'],
    ['EUR-EL', 4481, 'UEFA Europa League'], ['EUR-ECL', 5071, 'UEFA Conference League']
  ]) {
    const requests = [];
    const event = { idEvent: String(leagueId), strTimestamp: '2026-09-17T19:00:00', dateEvent: '2026-09-17', strStatus: 'NS', strSeason: '2026-2027', idLeague: String(leagueId), strLeague: leagueName, idHomeTeam: '133647', strHomeTeam: 'Celtic', idAwayTeam: '138899', strAwayTeam: 'Ferencváros' };
    const context = createContext({
      _fetchWithTimeout: async url => {
        requests.push(url);
        if (url.includes('v3.football.api-sports.io')) return { ok: true, json: async () => ({ errors: { plan: 'Competition unavailable.' }, response: [] }) };
        if (url.includes('/eventspastleague.php')) return { ok: true, json: async () => ({ events: [] }) };
        if (url.includes('/eventsnextleague.php')) return { ok: true, json: async () => ({ events: [event] }) };
        if (url.includes(`/eventsday.php?d=2026-09-17&l=${leagueId}`)) return { ok: true, json: async () => ({ events: [event] }) };
        throw new Error(`Unexpected URL: ${url}`);
      }
    });
    context.widget = widget({ competitionCode: code });
    const matches = await vm.runInContext("_footballTrackerLoad(widget, 'matches')", context);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].competition.name, leagueName);
    assert.ok(requests.some(url => url.includes(`/eventsnextleague.php?id=${leagueId}`)));
    assert.ok(requests.some(url => url.includes(`/eventsday.php?d=2026-09-17&l=${leagueId}`)));
    assert.equal(vm.runInContext("_footballTrackerState(widget).providers.matches", context), 'theSportsDb');
  }
});

test('partial DFB-Pokal coverage merges the adjacent TheSportsDB match day', async () => {
  const requests = [];
  const event = (id, date, homeId, home, awayId, away) => ({ idEvent: String(id), strTimestamp: `${date}T18:45:00`, dateEvent: date, strStatus: 'NS', strSeason: '2026-2027', idLeague: '4485', strLeague: 'DFB-Pokal', idHomeTeam: String(homeId), strHomeTeam: home, idAwayTeam: String(awayId), strAwayTeam: away });
  const today = event(2483318, '2026-09-01', 150001, 'HEBC Hamburg', 133650, 'Borussia Dortmund');
  const tomorrow = event(2483317, '2026-09-02', 134123, 'Osnabrück', 133664, 'Bayern Munich');
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('/leagues?search=DFB%20Pokal')) return { ok: true, json: async () => ({ response: [{ league: { id: 81, name: 'DFB Pokal' }, country: { name: 'Germany' }, seasons: [{ year: 2026, current: true }] }] }) };
      if (url.includes('/fixtures?league=81&season=2026')) return { ok: true, json: async () => ({ response: [{
        fixture: { id: 7001, timestamp: Date.parse('2026-09-01T18:45:00Z') / 1000, status: { short: 'NS' } }, league: { id: 81, name: 'DFB Pokal', country: 'Germany' },
        teams: { home: { id: 501, name: 'HEBC Hamburg' }, away: { id: 165, name: 'Borussia Dortmund' } }, goals: { home: null, away: null }, score: { fulltime: { home: null, away: null } }
      }] }) };
      if (url.includes('/eventspastleague.php?id=4485')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/eventsnextleague.php?id=4485')) return { ok: true, json: async () => ({ events: [today] }) };
      if (url.includes('/eventsday.php?d=2026-09-01&l=4485')) return { ok: true, json: async () => ({ events: [today] }) };
      if (url.includes('/eventsday.php?d=2026-09-02&l=4485')) return { ok: true, json: async () => ({ events: [tomorrow] }) };
      if (url.includes('/eventsday.php?d=2026-09-03&l=4485')) return { ok: true, json: async () => ({ events: [] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'DEU-DFB' });
  const matches = await vm.runInContext("_footballTrackerLoad(widget, 'matches')", context);
  assert.equal(matches.length, 2);
  assert.deepEqual([...matches].map(match => match.away.name), ['Borussia Dortmund', 'FC Bayern München']);
  assert.deepEqual([...new Set(matches.map(match => match.competition.provider))], ['apiFootball', 'theSportsDb']);
  assert.ok(requests.some(url => url.includes('/eventsday.php?d=2026-09-02&l=4485')));
});

test('unavailable current Champions League standings resolve to an empty state', async () => {
  const context = createContext({ _fetchWithTimeout: async () => { throw new Error('Season unavailable'); } });
  context.widget = widget({ competitionCode: 'CL' });
  const result = await vm.runInContext("_footballTrackerCompetitionData(widget, _footballTrackerCompetition(widget), 'standings')", context);
  assert.deepEqual([...result.value], []);
  assert.equal(result.provider, 'footballData');
});

test('Sportmonks network failures explain the required extension relay', async () => {
  const context = createContext({
    _fetchWithTimeout: async () => { throw new TypeError('NetworkError when attempting to fetch resource.'); },
    WidgetSDK: {
      cache: { get: () => null, set: value => value, remove: () => false },
      extensionRelay: { invoke: async () => ({ error: 'api.sportmonks.com returned 401: No token provided.' }) }
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' });
  await assert.rejects(vm.runInContext("_footballTrackerProviderRequest(widget, _footballTrackerCompetition(widget), 'leagues/501')", context), /Reload Firefox extension 1\.0\.40/);
});

test('API-Football fixtures and standings normalize into the shared model', () => {
  const context = createContext();
  context.payload = { response: [{
    fixture: { id: 45, timestamp: 1787338800, status: { short: 'FT' } }, league: { round: 'Quarter-finals' },
    teams: { home: { id: 1, name: 'Home', logo: 'https://media.api-sports.io/home.png', winner: true }, away: { id: 2, name: 'Away', logo: 'https://media.api-sports.io/away.png', winner: false } },
    goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } }
  }] };
  const matches = vm.runInContext('_footballTrackerApiFootballMatches(payload)', context);
  assert.equal(matches[0].status, 'FINISHED');
  assert.equal(matches[0].home.name, 'Home');
  assert.equal(matches[0].homeScore, 2);
  context.payload = { response: [{ league: { standings: [[{ rank: 1, team: { id: 1, name: 'Leaders', logo: 'https://media.api-sports.io/leaders.png' }, points: 12, goalsDiff: 8, all: { played: 4, win: 4, draw: 0, lose: 0, goals: { for: 10, against: 2 } } }]] } }] };
  const standings = vm.runInContext('_footballTrackerApiFootballStandings(payload)', context);
  assert.equal(standings[0].table[0].team.name, 'Leaders');
  assert.equal(standings[0].table[0].played, 4);
});

test('TheSportsDB results normalize qualifying matches into the shared model', () => {
  const context = createContext();
  context.payload = { results: [{
    idEvent: '2558133', strTimestamp: '2026-08-19T19:00:00', strStatus: 'FT', intRound: '400', strSeason: '2026-2027',
    idLeague: '4480', strLeague: 'UEFA Champions League', strLeagueBadge: 'https://r2.thesportsdb.com/champions.png',
    idHomeTeam: '133647', strHomeTeam: 'Celtic', strHomeTeamBadge: 'https://r2.thesportsdb.com/celtic.png', intHomeScore: '3',
    idAwayTeam: '137261', strAwayTeam: 'LASK', strAwayTeamBadge: 'https://r2.thesportsdb.com/lask.png', intAwayScore: '0'
  }] };
  const matches = vm.runInContext('_footballTrackerTheSportsDbMatches(payload)', context);
  assert.equal(matches[0].status, 'FINISHED');
  assert.equal(matches[0].competition.provider, 'theSportsDb');
  assert.equal(matches[0].competition.name, 'UEFA Champions League');
  assert.equal(matches[0].homeScore, 3);
  assert.equal(matches[0].awayScore, 0);
});

test('Sportmonks fixtures and standings normalize into the shared model', () => {
  const context = createContext();
  context.payload = { data: { fixtures: [{
    id: 501, starting_at_timestamp: 1787338800, state: { developer_name: 'FT' }, round: { name: '3' }, stage: { name: '1st Phase' },
    participants: [{ id: 53, name: 'Celtic', short_code: 'CEL', image_path: 'https://cdn.sportmonks.com/celtic.png', meta: { location: 'home' } }, { id: 62, name: 'Rangers', short_code: 'RAN', image_path: 'https://cdn.sportmonks.com/rangers.png', meta: { location: 'away' } }],
    scores: [{ description: 'CURRENT', score: { participant: 'home', goals: 2 } }, { description: 'CURRENT', score: { participant: 'away', goals: 1 } }]
  }] } };
  const matches = vm.runInContext('_footballTrackerSportmonksMatches(payload)', context);
  assert.equal(matches[0].home.name, 'Celtic');
  assert.equal(matches[0].awayScore, 1);
  context.payload = { data: [{ position: 1, points: 9, participant: { id: 53, name: 'Celtic', image_path: 'https://cdn.sportmonks.com/celtic.png' }, details: [
    { type_id: 129, value: 3 }, { type_id: 133, value: 8 }, { type_id: 134, value: 2 }, { type_id: 179, value: 6 }
  ] }] };
  const standings = vm.runInContext('_footballTrackerSportmonksStandings(payload)', context);
  assert.equal(standings[0].table[0].team.name, 'Celtic');
  assert.equal(standings[0].table[0].played, 3);
  assert.equal(standings[0].table[0].goalDifference, 6);
});

test('team history groups official competitions into tabs and keeps provider priority', () => {
  const context = createContext();
  context.team = { id: 1, name: 'Home FC', provider: 'footballData', area: 'England', competitionCode: 'PL' };
  context.ids = { footballData: 1, apiFootball: 101 };
  context.matches = [
    { id: 1, utcDate: 1000, status: 'FINISHED', home: { id: 1, name: 'Home FC' }, away: { id: 2, name: 'Away' }, homeScore: 2, awayScore: 1, competition: { provider: 'footballData', code: 'PL', name: 'Premier League', area: 'England' } },
    { id: 2, utcDate: 1000, status: 'FINISHED', home: { id: 101, name: 'Home' }, away: { id: 202, name: 'Away' }, homeScore: 2, awayScore: 1, competition: { provider: 'apiFootball', name: 'Premier League', area: 'England' } },
    { id: 3, utcDate: 2000, status: 'FINISHED', home: { id: 303, name: 'Cup Side' }, away: { id: 101, name: 'Home' }, homeScore: 0, awayScore: 3, competition: { provider: 'apiFootball', name: 'FA Cup', area: 'England' } },
    { id: 4, utcDate: 3000, status: 'SCHEDULED', home: { id: 101, name: 'Home' }, away: { id: 404, name: 'European Side' }, homeScore: null, awayScore: null, competition: { provider: 'apiFootball', name: 'UEFA Europa League', area: 'World' } },
    { id: 6, utcDate: 2500, status: 'POSTPONED', home: { id: 606, name: 'Another European Side' }, away: { id: 101, name: 'Home' }, homeScore: null, awayScore: null, competition: { provider: 'apiFootball', name: 'UEFA Europa League', area: 'World' } },
    { id: 5, utcDate: 4000, status: 'FINISHED', home: { id: 101, name: 'Home' }, away: { id: 505, name: 'Friendly Side' }, homeScore: 1, awayScore: 1, competition: { provider: 'apiFootball', name: 'Club Friendlies', area: 'World' } }
  ];
  const history = vm.runInContext('_footballTrackerBuildTeamHistory(matches, team, ids, "PL", 0)', context);
  assert.deepEqual([...history.groups].map(group => group.key), ['PL', 'EUR-EL', 'ENG-FAC']);
  assert.equal(history.groups[0].provider, 'footballData');
  assert.equal(history.groups[0].matches.length, 1);
  const faCup = history.groups.find(group => group.key === 'ENG-FAC');
  const europaLeague = history.groups.find(group => group.key === 'EUR-EL');
  assert.equal(faCup.matches[0].venue, 'A');
  assert.equal(faCup.matches[0].result, 'W');
  assert.equal(europaLeague.matches.length, 0);
  assert.deepEqual([...europaLeague.upcoming].map(match => match.id), [6, 4]);
  assert.equal(europaLeague.upcoming[0].venue, 'A');
  assert.equal(europaLeague.upcoming[0].status, 'POSTPONED');
});

test('team history merges provider gaps without duplicating the same fixture', () => {
  const context = createContext();
  context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  context.ids = { sportmonks: 53, footballData: 732 };
  context.matches = [
    { id: 10, utcDate: Date.parse('2026-08-19T19:00:00Z'), status: 'FINISHED', home: { id: 732, name: 'Celtic' }, away: { id: 185, name: 'LASK' }, homeScore: 3, awayScore: 0, competition: { provider: 'footballData', code: 'CL', name: 'UEFA Champions League', area: 'Europe' } },
    { id: 20, utcDate: Date.parse('2026-08-19T19:00:00Z'), status: 'FINISHED', home: { id: 53, name: 'Celtic' }, away: { id: 500, name: 'LASK' }, homeScore: 3, awayScore: 0, competition: { provider: 'sportmonks', name: 'UEFA Champions League', area: 'Europe' } },
    { id: 21, utcDate: Date.parse('2026-08-25T19:00:00Z'), status: 'FINISHED', home: { id: 500, name: 'LASK' }, away: { id: 53, name: 'Celtic' }, homeScore: 1, awayScore: 2, competition: { provider: 'sportmonks', name: 'UEFA Champions League', area: 'Europe' } }
  ];
  const history = vm.runInContext('_footballTrackerBuildTeamHistory(matches, team, ids, "SCO-PL")', context);
  assert.equal(history.groups[0].key, 'CL');
  assert.deepEqual([...history.groups[0].matches].map(match => match.id), [21, 10]);
  assert.deepEqual([...history.groups[0].providers], ['footballData', 'sportmonks']);
  assert.equal(history.groups[0].matches[0].venue, 'A');
});

test('cross-provider fixture merging treats VfB Stuttgart and Stuttgart as one opponent', () => {
  const context = createContext();
  const kickoff = Date.parse('2026-08-28T18:30:00Z');
  context.team = { id: 5, name: 'FC Bayern München', provider: 'footballData', area: 'Germany', competitionCode: 'BL1' };
  context.ids = { footballData: 5, theSportsDb: 133664 };
  context.matches = [
    { id: 100, utcDate: kickoff, status: 'FINISHED', home: { id: 5, name: 'FC Bayern München' }, away: { id: 10, name: 'VfB Stuttgart' }, homeScore: 5, awayScore: 1, competition: { provider: 'footballData', code: 'BL1', name: 'Bundesliga', area: 'Germany' } },
    { id: 200, utcDate: kickoff, status: 'FINISHED', home: { id: 133664, name: 'Bayern Munich' }, away: { id: 133676, name: 'Stuttgart' }, homeScore: 5, awayScore: 1, competition: { provider: 'theSportsDb', id: 4331, name: 'German Bundesliga', area: 'Germany' } }
  ];
  const history = vm.runInContext('_footballTrackerBuildTeamHistory(matches, team, ids, "BL1", 0)', context);
  assert.equal(history.groups[0].matches.length, 1);
  assert.equal(history.groups[0].matches[0].opponent.name, 'VfB Stuttgart');
  const merged = vm.runInContext('_footballTrackerMergeMatchCoverage([matches[0]], [matches[1]])', context);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].away.name, 'VfB Stuttgart');
  assert.equal(vm.runInContext("_footballTrackerEquivalentTeamNames('Bayern Munich', '1860 Munich')", context), false);
});

test('cross-provider team history resolves API-Football once and adds missing cups', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('api.football-data.org') && url.includes('/teams/1/matches')) return { ok: true, json: async () => ({ matches: [{
        id: 11, utcDate: '2026-08-12T19:00:00Z', status: 'FINISHED', homeTeam: { id: 1, name: 'Home FC' }, awayTeam: { id: 2, name: 'League Side' }, score: { fullTime: { home: 2, away: 0 } }, competition: { id: 2021, code: 'PL', name: 'Premier League', area: { name: 'England' } }
      }] }) };
      if (url.includes('/teams?search=')) return { ok: true, json: async () => ({ response: [{ team: { id: 101, name: 'Home FC', country: 'England', logo: 'https://media.api-sports.io/home.png' } }] }) };
      if (url.includes('/fixtures?team=101')) return { ok: true, json: async () => ({ response: [{
        fixture: { id: 22, timestamp: 1787173200, status: { short: 'FT' } }, league: { id: 45, name: 'FA Cup', country: 'England' },
        teams: { home: { id: 101, name: 'Home FC', winner: true }, away: { id: 202, name: 'Cup Side', winner: false } }, goals: { home: 1, away: 0 }, score: { fulltime: { home: 1, away: 0 } }
      }] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget(); context.team = { id: 1, name: 'Home FC', provider: 'footballData', area: 'England', competitionCode: 'PL' };
  const history = await vm.runInContext('_footballTrackerFetchTeamHistory(widget, team)', context);
  assert.deepEqual([...history.groups].map(group => group.key), ['PL', 'ENG-FAC']);
  assert.ok(requests.some(url => /teams\/1\/matches\?season=\d{4}&limit=500/.test(url)));
  assert.ok(requests.every(url => !url.includes('status=FINISHED')));
  assert.ok(requests.some(url => /teams\?search=Home%20FC/.test(url)));
  assert.ok(requests.some(url => /fixtures\?team=101&season=\d{4}/.test(url)));
  await vm.runInContext('_footballTrackerResolveApiFootballTeam(widget, team)', context);
  assert.equal(requests.filter(url => url.includes('/teams?search=')).length, 1);
});

test('API-Football team linking cannot cross a domestic country boundary', async () => {
  const context = createContext({
    _fetchWithTimeout: async url => {
      assert.match(url, /teams\?search=Hearts$/);
      return { ok: true, json: async () => ({ response: [
        { team: { id: 1001, name: 'Hearts', country: 'Ghana' } },
        { team: { id: 62, name: 'Heart of Midlothian', country: 'Scotland' } }
      ] }) };
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' });
  context.team = { id: 62, name: 'Hearts', lookupName: 'Hearts', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const resolved = await vm.runInContext('_footballTrackerResolveApiFootballTeam(widget, team)', context);
  assert.equal(resolved.id, 62);
  assert.equal(resolved.name, 'Heart of Midlothian');

  const wrongOnly = createContext({
    _fetchWithTimeout: async () => ({ ok: true, json: async () => ({ response: [{ team: { id: 1001, name: 'Hearts', country: 'Ghana' } }] }) })
  });
  wrongOnly.widget = widget({ competitionCode: 'SCO-PL' }); wrongOnly.team = context.team;
  await assert.rejects(vm.runInContext('_footballTrackerResolveApiFootballTeam(widget, team)', wrongOnly), /could not find Hearts/);
});

test('TheSportsDB team linking requires domestic country and competition compatibility', async () => {
  const context = createContext({
    _fetchWithTimeout: async url => {
      assert.match(url, /searchteams\.php\?t=Hearts$/);
      return { ok: true, json: async () => ({ teams: [
        { idTeam: '135550', strTeam: 'Hearts', strCountry: 'Ghana', idLeague: '4362', strLeague: 'Ghana Premier League' },
        { idTeam: '133637', strTeam: 'Heart of Midlothian', strCountry: 'Scotland', idLeague: '4330', strLeague: 'Scottish Premier League' }
      ] }) };
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' });
  context.team = { id: 62, name: 'Hearts', lookupName: 'Hearts', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const resolved = await vm.runInContext('_footballTrackerResolveTheSportsDbTeam(widget, team)', context);
  assert.equal(resolved.id, 133637);
  assert.equal(resolved.name, 'Heart of Midlothian');
  assert.deepEqual([...resolved.leagueIds], [4330]);
});

test('a failed fallback stays silent when the primary provider returns team history', async () => {
  const context = createContext({
    _fetchWithTimeout: async url => {
      if (url.includes('api.football-data.org')) return { ok: true, json: async () => ({ matches: [{
        id: 11, utcDate: '2026-08-12T19:00:00Z', status: 'FINISHED', homeTeam: { id: 1, name: 'Home FC' }, awayTeam: { id: 2, name: 'League Side' }, score: { fullTime: { home: 2, away: 0 } }, competition: { code: 'PL', name: 'Premier League', area: { name: 'England' } }
      }] }) };
      return { ok: true, json: async () => ({ errors: { plan: 'Free plans do not have access to this season.' }, response: [] }) };
    }
  });
  context.widget = widget(); context.team = { id: 1, name: 'Home FC', provider: 'footballData', area: 'England', competitionCode: 'PL' };
  const history = await vm.runInContext('_footballTrackerFetchTeamHistory(widget, team)', context);
  assert.equal(history.groups[0].key, 'PL');
  assert.equal(history.warnings, undefined);
});

test('total team-history failure reports one generic provider warning', async () => {
  const context = createContext({ _fetchWithTimeout: async () => { throw new Error('private provider diagnostic'); } });
  context.widget = widget(); context.team = { id: 1, name: 'Home FC', provider: 'footballData', area: 'England', competitionCode: 'PL' };
  await assert.rejects(vm.runInContext('_footballTrackerFetchTeamHistory(widget, team)', context), error => {
    assert.match(error.message, /Home FC's current-season match history could not be retrieved from any available provider/);
    assert.doesNotMatch(error.message, /private provider diagnostic|relay unavailable|API-Football/);
    return true;
  });
});

test('Sportmonks team history uses the full active-season range and labels the Premiership', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      return { ok: true, json: async () => ({ data: [{ league_id: 501, rounds: [{ name: '1', fixtures: [{
        id: 900, starting_at_timestamp: 1787338800, state: { developer_name: 'FT' },
        participants: [{ id: 53, name: 'Celtic', meta: { location: 'home' } }, { id: 62, name: 'Rangers', meta: { location: 'away' } }],
        scores: [{ description: 'CURRENT', score: { participant: 'home', goals: 2 } }, { description: 'CURRENT', score: { participant: 'away', goals: 1 } }]
      }] }] }] }) };
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' }); context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const matches = await vm.runInContext('_footballTrackerProviderTeamMatches(widget, team, 2026)', context);
  assert.match(requests[0], /fixtures\/between\/2026-07-01\/2027-06-30\/53\?include=/);
  assert.equal(matches[0].competition.name, 'Premiership');
  assert.equal(matches[0].home.name, 'Celtic');
});

test('Sportmonks clubs gain a cached football-data.org Champions League tab', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('api.sportmonks.com') && url.includes('/fixtures/between/2026-07-01/2027-06-30/53')) return { ok: true, json: async () => ({ data: [{ league_id: 501, rounds: [{ name: '1', fixtures: [{
        id: 900, starting_at_timestamp: 1786734000, state: { developer_name: 'FT' }, participants: [{ id: 53, name: 'Celtic', meta: { location: 'home' } }, { id: 70, name: 'Dundee', meta: { location: 'away' } }],
        scores: [{ description: 'CURRENT', score: { participant: 'home', goals: 1 } }, { description: 'CURRENT', score: { participant: 'away', goals: 0 } }]
      }] }] }] }) };
      if (url.includes('api.football-data.org') && url.includes('/competitions/CL/matches')) return { ok: true, json: async () => ({ matches: [{
        id: 901, utcDate: '2026-08-19T19:00:00Z', status: 'FINISHED', homeTeam: { id: 732, name: 'Celtic FC', shortName: 'Celtic' }, awayTeam: { id: 185, name: 'LASK' }, score: { fullTime: { home: 2, away: 1 } }, competition: { id: 2001, code: 'CL', name: 'UEFA Champions League', area: { name: 'Europe' } }
      }] }) };
      if (url.includes('v3.football.api-sports.io')) return { ok: true, json: async () => ({ errors: { plan: 'Current season unavailable.' }, response: [] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' }); context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  vm.runInContext("WidgetSDK.cache.set('footballTracker', widget.id, 'footballData:CL:matches', [], { ttlMs: 86400000 })", context);
  const history = await vm.runInContext('_footballTrackerFetchTeamHistory(widget, team)', context);
  assert.deepEqual([...history.groups].map(group => group.key), ['SCO-PL', 'CL']);
  assert.equal(history.groups[1].matches[0].opponent.name, 'LASK');
  assert.equal(history.groups[1].provider, 'footballData');
  await vm.runInContext('_footballTrackerFootballDataChampionsLeagueMatches(widget, team, 2026)', context);
  assert.equal(requests.filter(url => url.includes('/competitions/CL/matches')).length, 1);
  assert.ok(requests.some(url => url.includes('/competitions/CL/matches?season=2026')));
});

test('TheSportsDB fills a Champions League tab when configured providers omit it', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('api.sportmonks.com') && url.includes('/fixtures/between/2026-07-01/2027-06-30/53')) return { ok: true, json: async () => ({ data: [{ league_id: 501, rounds: [{ name: '1', fixtures: [{
        id: 900, starting_at_timestamp: 1786734000, state: { developer_name: 'FT' }, participants: [{ id: 53, name: 'Celtic', meta: { location: 'home' } }, { id: 70, name: 'Dundee', meta: { location: 'away' } }],
        scores: [{ description: 'CURRENT', score: { participant: 'home', goals: 1 } }, { description: 'CURRENT', score: { participant: 'away', goals: 0 } }]
      }] }] }] }) };
      if (url.includes('api.football-data.org') && url.includes('/competitions/CL/matches')) return { ok: true, json: async () => ({ matches: [] }) };
      if (url.includes('v3.football.api-sports.io')) return { ok: true, json: async () => ({ errors: { plan: 'Current season unavailable.' }, response: [] }) };
      if (url.includes('/searchteams.php?t=Celtic')) return { ok: true, json: async () => ({ teams: [{ idTeam: '133647', idAPIfootball: '247', strTeam: 'Celtic', strCountry: 'Scotland', strBadge: 'https://r2.thesportsdb.com/celtic.png' }] }) };
      if (url.includes('/eventslast.php?id=133647')) return { ok: true, json: async () => ({ results: [{
        idEvent: '2558133', strTimestamp: '2026-08-19T19:00:00', strStatus: 'FT', strSeason: '2026-2027', idLeague: '4480', strLeague: 'UEFA Champions League',
        idHomeTeam: '133647', strHomeTeam: 'Celtic', strHomeTeamBadge: 'https://r2.thesportsdb.com/celtic.png', intHomeScore: '3',
        idAwayTeam: '137261', strAwayTeam: 'LASK', strAwayTeamBadge: 'https://r2.thesportsdb.com/lask.png', intAwayScore: '0'
      }] }) };
      if (url.includes('/eventsnext.php?id=133647')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/searchevents.php?e=LASK_vs_Celtic&s=2026-2027')) return { ok: true, json: async () => ({ event: [{
        idEvent: '2558134', strTimestamp: '2026-08-25T19:00:00', strStatus: 'FT', strSeason: '2026-2027', idLeague: '4480', strLeague: 'UEFA Champions League',
        idHomeTeam: '137261', strHomeTeam: 'LASK', strHomeTeamBadge: 'https://r2.thesportsdb.com/lask.png', intHomeScore: '1',
        idAwayTeam: '133647', strAwayTeam: 'Celtic', strAwayTeamBadge: 'https://r2.thesportsdb.com/celtic.png', intAwayScore: '2'
      }] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' }); context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const history = await vm.runInContext('_footballTrackerFetchTeamHistory(widget, team)', context);
  assert.deepEqual([...history.groups].map(group => group.key), ['SCO-PL', 'CL']);
  assert.equal(history.groups[1].provider, 'theSportsDb');
  assert.equal(history.groups[1].matches.length, 2);
  assert.equal(history.groups[1].matches[0].opponent.name, 'LASK');
  assert.equal(history.groups[1].matches[0].venue, 'A');
  assert.equal(history.groups[1].matches[0].homeScore, 1);
  assert.ok(requests.some(url => url.includes('/eventslast.php?id=133647')));
  assert.ok(requests.some(url => url.includes('/eventsnext.php?id=133647')));
  assert.ok(requests.some(url => url.includes('/searchevents.php?e=LASK_vs_Celtic&s=2026-2027')));
});

test('TheSportsDB team associations trigger a targeted current-season UEFA lookup', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('/searchteams.php?t=Celtic')) return { ok: true, json: async () => ({ teams: [{
        idTeam: '133647', idAPIfootball: '247', strTeam: 'Celtic', strCountry: 'Scotland', idLeague: '4330', strLeague: 'Scottish Premier League', idLeague5: '4481', strLeague5: 'UEFA Europa League'
      }] }) };
      if (url.includes('/eventslast.php') || url.includes('/eventsnext.php')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/searchevents.php?e=Celtic&s=2026-2027')) return { ok: true, json: async () => ({ event: [{
        idEvent: '2594851', strTimestamp: '2026-09-17T19:00:00', strStatus: 'NS', strSeason: '2026-2027', idLeague: '4481', strLeague: 'UEFA Europa League',
        idHomeTeam: '133647', strHomeTeam: 'Celtic', idAwayTeam: '138899', strAwayTeam: 'Ferencváros'
      }] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' }); context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const result = await vm.runInContext('_footballTrackerTheSportsDbRecentMatches(widget, team, 2026)', context);
  assert.deepEqual([...result.resolved.leagueIds], [4330, 4481]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].competition.name, 'UEFA Europa League');
  assert.ok(requests.some(url => url.includes('/searchevents.php?e=Celtic&s=2026-2027')));
});

test('TheSportsDB domestic cup windows recover away fixtures omitted by free team search', async () => {
  const requests = [];
  const seed = { idEvent: '2600000', strTimestamp: '2026-09-11T19:00:00', dateEvent: '2026-09-11', strStatus: 'NS', strSeason: '2026-2027', idLeague: '4888', strLeague: 'Scottish League Cup', idHomeTeam: '140001', strHomeTeam: 'Stenhousemuir', idAwayTeam: '133637', strAwayTeam: 'Heart of Midlothian' };
  const derby = { idEvent: '2578586', strTimestamp: '2026-09-13T14:00:00', dateEvent: '2026-09-13', strStatus: 'NS', strSeason: '2026-2027', idLeague: '4888', strLeague: 'Scottish League Cup', idHomeTeam: '133642', strHomeTeam: 'Rangers', idAwayTeam: '133647', strAwayTeam: 'Celtic' };
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('/searchteams.php?t=Celtic')) return { ok: true, json: async () => ({ teams: [{ idTeam: '133647', strTeam: 'Celtic', strCountry: 'Scotland', idLeague: '4330', strLeague: 'Scottish Premier League', idLeague3: '4888', strLeague3: 'Scottish League Cup' }] }) };
      if (url.includes('/eventslast.php?id=133647') || url.includes('/eventsnext.php?id=133647')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/eventspastleague.php?id=4888')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/eventsnextleague.php?id=4888')) return { ok: true, json: async () => ({ events: [seed] }) };
      if (url.includes('/eventsday.php?d=2026-09-11&l=4888')) return { ok: true, json: async () => ({ events: [seed] }) };
      if (url.includes('/eventsday.php?d=2026-09-12&l=4888')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/eventsday.php?d=2026-09-13&l=4888')) return { ok: true, json: async () => ({ events: [derby] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' }); context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const result = await vm.runInContext('_footballTrackerTheSportsDbRecentMatches(widget, team, 2026)', context);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].home.name, 'Rangers');
  assert.equal(result.matches[0].away.name, 'Celtic');
  context.result = result;
  assert.equal(vm.runInContext('_footballTrackerCanonicalCompetition(result.matches[0].competition).key', context), 'SCO-LC');
  assert.ok(requests.some(url => url.includes('/eventsday.php?d=2026-09-13&l=4888')));
  assert.ok(requests.every(url => !url.includes('/searchevents.php')));
});

test('full club identities avoid Bayern Hof and bridge München to Munich', async () => {
  const requests = [];
  const seed = { idEvent: '2483318', strTimestamp: '2026-09-01T18:45:00', dateEvent: '2026-09-01', strStatus: 'NS', strSeason: '2026-2027', idLeague: '4485', strLeague: 'DFB-Pokal', idHomeTeam: '150001', strHomeTeam: 'HEBC Hamburg', idAwayTeam: '133650', strAwayTeam: 'Borussia Dortmund' };
  const bayern = { idEvent: '2483317', strTimestamp: '2026-09-02T18:45:00', dateEvent: '2026-09-02', strStatus: 'NS', strSeason: '2026-2027', idLeague: '4485', strLeague: 'DFB-Pokal', idHomeTeam: '134123', strHomeTeam: 'Osnabrück', idAwayTeam: '133664', strAwayTeam: 'Bayern Munich' };
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      if (url.includes('/searchteams.php?t=FC%20Bayern%20M%C3%BCnchen')) return { ok: true, json: async () => ({ teams: [
        { idTeam: '155704', strTeam: 'Bayern Hof', strCountry: 'Germany', idLeague: '5892', strLeague: 'German Oberliga Bayern Nord' },
        { idTeam: '133664', strTeam: 'Bayern Munich', strCountry: 'Germany', idLeague: '4331', strLeague: 'German Bundesliga', idLeague2: '4485', strLeague2: 'DFB-Pokal' }
      ] }) };
      if (url.includes('/eventslast.php?id=133664') || url.includes('/eventsnext.php?id=133664')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/eventspastleague.php?id=4485')) return { ok: true, json: async () => ({ events: [] }) };
      if (url.includes('/eventsnextleague.php?id=4485')) return { ok: true, json: async () => ({ events: [seed] }) };
      if (url.includes('/eventsday.php?d=2026-09-01&l=4485')) return { ok: true, json: async () => ({ events: [seed] }) };
      if (url.includes('/eventsday.php?d=2026-09-02&l=4485')) return { ok: true, json: async () => ({ events: [bayern] }) };
      if (url.includes('/eventsday.php?d=2026-09-03&l=4485')) return { ok: true, json: async () => ({ events: [] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'BL1' }); context.team = { id: 5, name: 'Bayern', lookupName: 'FC Bayern München', provider: 'footballData', area: 'Germany', competitionCode: 'BL1' };
  const result = await vm.runInContext('_footballTrackerTheSportsDbRecentMatches(widget, team, 2026)', context);
  assert.equal(result.resolved.id, 133664);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].away.id, 133664);
  assert.equal(result.matches[0].away.name, 'FC Bayern München');
});

test('full Borussia Dortmund identity rejects the regional Dortmund search result', async () => {
  const context = createContext({
    _fetchWithTimeout: async url => {
      assert.match(url, /searchteams\.php\?t=Borussia%20Dortmund$/);
      return { ok: true, json: async () => ({ teams: [
        { idTeam: '155917', strTeam: 'ASC 09 Dortmund', strCountry: 'Germany', idLeague: '5904', strLeague: 'German Oberliga Westfalen' },
        { idTeam: '133650', strTeam: 'Borussia Dortmund', strCountry: 'Germany', idLeague: '4331', strLeague: 'German Bundesliga', idLeague2: '4485', strLeague2: 'DFB-Pokal' }
      ] }) };
    }
  });
  context.widget = widget({ competitionCode: 'BL1' }); context.team = { id: 4, name: 'Dortmund', lookupName: 'Borussia Dortmund', provider: 'footballData', area: 'Germany', competitionCode: 'BL1' };
  const resolved = await vm.runInContext('_footballTrackerResolveTheSportsDbTeam(widget, team)', context);
  assert.equal(resolved.id, 133650);
  assert.deepEqual([...resolved.leagueIds], [4331, 4485]);
});

test('TheSportsDB retains discovered current-season results across later checks', async () => {
  let latest = 'champions';
  const context = createContext({
    _fetchWithTimeout: async url => {
      if (url.includes('/searchteams.php')) return { ok: true, json: async () => ({ teams: [{ idTeam: '133647', strTeam: 'Celtic', strCountry: 'Scotland' }] }) };
      if (url.includes('/eventslast.php')) return { ok: true, json: async () => ({ results: latest === 'champions' ? [{
        idEvent: '2558133', strTimestamp: '2026-08-19T19:00:00', strStatus: 'FT', strSeason: '2026-2027', idLeague: '4480', strLeague: 'UEFA Champions League',
        idHomeTeam: '133647', strHomeTeam: 'Celtic', intHomeScore: '3', idAwayTeam: '137261', strAwayTeam: 'LASK', intAwayScore: '0'
      }] : [{
        idEvent: '2559000', strTimestamp: '2026-08-22T14:00:00', strStatus: 'FT', strSeason: '2026-2027', idLeague: '4330', strLeague: 'Scottish Premier League',
        idHomeTeam: '133639', strHomeTeam: 'St. Johnstone', intHomeScore: '0', idAwayTeam: '133647', strAwayTeam: 'Celtic', intAwayScore: '2'
      }] }) };
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  context.widget = widget({ competitionCode: 'SCO-PL' }); context.team = { id: 53, name: 'Celtic', provider: 'sportmonks', area: 'Scotland', competitionCode: 'SCO-PL' };
  const first = await vm.runInContext('_footballTrackerTheSportsDbRecentMatches(widget, team, 2026)', context);
  latest = 'league';
  const second = await vm.runInContext('_footballTrackerTheSportsDbRecentMatches(widget, team, 2026)', context);
  assert.equal(first.matches.length, 1);
  assert.equal(second.matches.length, 2);
  assert.ok(second.matches.some(match => match.competition.name === 'UEFA Champions League'));
});

test('team history is date-cached and manual reload bypasses the cached result', async () => {
  const context = createContext(); context.widget = widget(); context.team = { id: 1, name: 'Home FC', provider: 'footballData', area: 'England', competitionCode: 'PL' }; context.calls = 0;
  vm.runInContext('_footballTrackerFetchTeamHistory = async (_widget, selected) => { calls += 1; return { team: selected, groups: [], providers: [selected.provider], warnings: [] }; }; _footballTrackerState(widget).selectedTeam = team;', context);
  await vm.runInContext('_footballTrackerLoadTeamHistory(widget, team)', context);
  await vm.runInContext('_footballTrackerLoadTeamHistory(widget, team)', context);
  assert.equal(context.calls, 1);
  await vm.runInContext('_footballTrackerLoadTeamHistory(widget, team, true)', context);
  assert.equal(context.calls, 2);
});

test('provider metadata resolution is cached and builds competition-specific requests', async () => {
  const requests = [];
  const context = createContext({
    _fetchWithTimeout: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/leagues?')) return { ok: true, json: async () => ({ response: [{ league: { id: 81, name: 'DFB Pokal' }, country: { name: 'Germany' }, seasons: [{ year: 2026, current: true }] }] }) };
      if (url.includes('/fixtures?')) return { ok: true, json: async () => ({ response: [] }) };
      if (url.includes('/leagues/501')) return { ok: true, json: async () => ({ data: { current_season: { id: 25500 } } }) };
      return { ok: true, json: async () => ({ data: { fixtures: [] } }) };
    }
  });
  context.widget = widget({ competitionCode: 'DEU-DFB' });
  await vm.runInContext("_footballTrackerCompetitionPayload(widget, _footballTrackerCompetition(widget), 'matches')", context);
  assert.match(requests[0].url, /leagues\?search=DFB%20Pokal$/);
  assert.doesNotMatch(requests[0].url, /[?&](?:current|country)=/);
  assert.match(requests[1].url, /fixtures\?league=81&season=2026/);
  assert.equal(requests[0].options.headers['x-apisports-key'], 'api-football-key');
  await vm.runInContext("_footballTrackerCompetitionPayload(widget, _footballTrackerCompetition(widget), 'matches')", context);
  assert.equal(requests.filter(request => request.url.includes('/leagues?')).length, 1);
  await vm.runInContext("_footballTrackerCompetitionPayload(widget, _footballTrackerCompetition(widget), 'matches', true)", context);
  assert.equal(requests.filter(request => request.url.includes('/leagues?')).length, 2);

  context.widget = widget({ competitionCode: 'SCO-PL' });
  await vm.runInContext("_footballTrackerCompetitionPayload(widget, _footballTrackerCompetition(widget), 'matches')", context);
  assert.match(requests.at(-2).url, /leagues\/501\?include=currentSeason/);
  assert.match(requests.at(-1).url, /schedules\/seasons\/25500/);
  assert.equal(requests.at(-1).options.headers.Authorization, 'sportmonks-token');
});

test('every API-Football competition uses search alone and ranks country locally', async () => {
  const requests = []; let expected = null;
  const context = createContext({
    _fetchWithTimeout: async url => {
      requests.push(url);
      const search = new URL(url).searchParams.get('search');
      return { ok: true, json: async () => ({ response: [
        { league: { id: 9999, name: search }, country: { name: 'Wrong country' }, seasons: [{ year: 2026, current: true }] },
        { league: { id: expected.id, name: search }, country: { name: expected.country }, seasons: [{ year: 2026, current: true }] }
      ] }) };
    }
  });
  const competitions = vm.runInContext("FOOTBALL_TRACKER_COMPETITIONS.filter(entry => entry.provider === 'apiFootball').map(entry => ({ code: entry.code, country: entry.apiCountry || entry.area, search: entry.apiSearch }))", context);
  for (let index = 0; index < competitions.length; index += 1) {
    const competition = competitions[index]; expected = { id: 1000 + index, country: competition.country };
    context.code = competition.code;
    const meta = await vm.runInContext('_footballTrackerProviderMeta(widget, _footballTrackerCompetition(code))', Object.assign(context, { widget: widget({ competitionCode: competition.code }) }));
    assert.equal(meta.leagueId, expected.id, competition.code);
    const request = new URL(requests.at(-1));
    assert.deepEqual([...request.searchParams.keys()], ['search']);
    assert.equal(request.searchParams.get('search'), competition.search);
  }
});

test('same-day duplicate widgets share one provider load', async () => {
  let requestCount = 0;
  const context = createContext({
    _fetchWithTimeout: async () => { requestCount += 1; return { ok: true, json: async () => ({ matches: [] }) }; }
  });
  context.first = widget(); context.second = { ...widget(), id: 'football-2', config: { ...widget().config } };
  await vm.runInContext("_footballTrackerLoad(first, 'matches')", context);
  await vm.runInContext("_footballTrackerLoad(second, 'matches')", context);
  assert.equal(requestCount, 1);
});

test('widget is a responsive Sports descriptor using local cache and optional relay', () => {
  const context = createContext(); const descriptor = context.WIDGET_REGISTRY.footballTracker;
  assert.equal(descriptor.category, 'Sports');
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.allowedIn)), ['column', 'navpane']);
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.defaultData)), {});
  assert.equal(descriptor.capabilities.localCache.quotaBytes, 2 * 1024 * 1024);
  assert.equal(descriptor.capabilities.extensionRelay.optional, true);
  assert.ok(descriptor.capabilities.network.domains.includes('api.football-data.org'));
  assert.ok(descriptor.capabilities.network.domains.includes('api.sportmonks.com'));
  assert.ok(descriptor.capabilities.network.domains.includes('v3.football.api-sports.io'));
  assert.ok(descriptor.capabilities.network.domains.includes('www.thesportsdb.com'));
  assert.match(source, /_footballTrackerRenderHistoryAttribution\(\{ providers: displayedProviders \}\)/);
  assert.doesNotMatch(source, /\blocalStorage\b|\bfetch\s*\(/);
});

test('football assets load after the SDK and include compact layouts', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, 'football-tracker-widget.css'), 'utf8');
  assert.ok(html.indexOf('widget-sdk.js') < html.indexOf('football-tracker-widget.js'));
  assert.match(html, /football-tracker-widget\.css/);
  assert.match(css, /football-tracker-widget\.is-compact/);
  assert.match(css, /@container\(max-width:340px\)/);
  assert.match(source, /Country \/ area/);
  assert.match(source, /League \/ competition/);
  assert.match(css, /football-tracker-history-tabs/);
  assert.match(css, /football-tracker-history-match/);
  assert.match(css, /football-tracker-history-section-heading/);
});

test('teams are keyboard-accessible history controls with competition tabs and a back action', () => {
  assert.match(source, /document\.createElement\(canOpen \? 'button' : 'span'\)/);
  assert.match(source, /View \$\{team\.name\} current-season match history/);
  assert.match(source, /setAttribute\('role', 'tablist'\)/);
  assert.match(source, /Back to competition/);
  assert.match(source, /football-tracker-history-sort/);
  assert.match(source, /Show oldest matches first/);
  assert.match(source, /_footballTrackerSortHistoryMatches\(selected\.matches, runtime\.historySort\)/);
  assert.match(source, /\[\.\.\.upcoming\]\.sort\(\(left, right\) => left\.utcDate - right\.utcDate\)/);
  assert.match(source, /heading\.textContent = 'Upcoming'/);
  assert.ok(source.indexOf("heading.textContent = 'Results'") < source.indexOf("heading.textContent = 'Upcoming'"));
  assert.match(source, /kickoff\.toLocaleTimeString/);
  assert.match(source, /_footballTrackerVisibleUpcoming\(widget, group\.upcoming, historyNow\)\.length/);
  assert.match(source, /Upcoming fixtures/);
  assert.match(source, /Next 5 fixtures/);
  assert.match(source, /image\.draggable = false/);
  assert.match(source, /runtime\.selectedTeam \? _footballTrackerLoadTeamHistory/);
  assert.match(source, /could not be retrieved from any available provider/);
  assert.match(source, /history\.warnings/);
  assert.match(source, /coverage.*incomplete/i);
});

test('standings render goals for and against alongside the existing statistics', () => {
  assert.match(source, /<span>P<\/span><span>GF<\/span><span>GA<\/span><span>GD<\/span><span>Pts<\/span>/);
  assert.match(source, /goalsFor\.textContent = String\(entry\.goalsFor\)/);
  assert.match(source, /goalsAgainst\.textContent = String\(entry\.goalsAgainst\)/);
  assert.match(source, /row\.append\(position, teamCell, played, goalsFor, goalsAgainst, difference, points\)/);
  assert.match(source, /_footballTrackerFavouriteButton\(widget, entry\.team\)/);
  const css = fs.readFileSync(path.join(__dirname, 'football-tracker-widget.css'), 'utf8');
  assert.match(css, /football-tracker-favourite/);
});

test('completed async loads refresh every rendered tracker instance', () => {
  assert.match(source, /_setWidgetRefresher\(widget\.id, context, rerender\)/);
  assert.match(source, /_refreshWidget\(widget\.id, 'column'\)/);
  assert.match(source, /_refreshWidget\(widget\.id, 'navpane'\)/);
});

test('football data remains cached until the local date changes', () => {
  const context = createContext();
  const now = new Date(2026, 7, 21, 23, 59, 0).getTime();
  context.now = now;
  const delay = vm.runInContext('_footballTrackerMsUntilDateChange(now)', context);
  assert.ok(delay >= 60_000 && delay <= 62_000);
  assert.doesNotMatch(source, /FOOTBALL_TRACKER_(?:MATCH|STANDINGS)_CACHE_MS/);
  assert.match(source, /ttlMs: _footballTrackerMsUntilDateChange\(\)/);
});

test('date rollover clears both cached views once and rerenders the tracker', () => {
  const refreshes = [];
  const context = createContext({ _refreshWidget: (...args) => refreshes.push(args.join(':')) });
  context.widget = widget();
  vm.runInContext("_footballTrackerState(widget).dateKey = '2000-01-01'; WidgetSDK.cache.set('footballTracker', widget.id, _footballTrackerCacheKey(_footballTrackerCompetition(widget), 'matches'), [1]); WidgetSDK.cache.set('footballTracker', widget.id, _footballTrackerCacheKey(_footballTrackerCompetition(widget), 'standings'), [2]);", context);
  assert.equal(vm.runInContext('_footballTrackerRefreshForDate(widget)', context), true);
  assert.equal([...context.__cache.keys()].some(key => key.includes('footballData:PL:matches:season:2026')), false);
  assert.equal([...context.__cache.keys()].some(key => key.includes('footballData:PL:standings:season:2026')), false);
  assert.deepEqual(refreshes, ['football-1:column', 'football-1:navpane']);
  assert.equal(vm.runInContext('_footballTrackerRefreshForDate(widget)', context), false);
  assert.equal(refreshes.length, 2);
});

test('provider status vocabulary preserves results, live play and interruptions', () => {
  const context = createContext();
  context.values = ['Match Finished', 'Match Cancelled', 'Match Postponed', 'FT_PEN', 'INPLAY_1ST_HALF', 'INPLAY_ET', 'INPLAY_PENALTIES', 'DELAYED', 'INTERRUPTED', 'INT', 'Not Started'];
  const statuses = vm.runInContext('values.map(_footballTrackerProviderStatus)', context);
  assert.deepEqual([...statuses], ['FINISHED', 'CANCELLED', 'POSTPONED', 'FINISHED', 'IN_PLAY', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'DELAYED', 'SUSPENDED', 'SUSPENDED', 'SCHEDULED']);
  assert.equal(vm.runInContext("_footballTrackerProviderStatusWithScore('', Date.now() - 86400000, 2, 1)" , context), 'FINISHED');
});

test('club aliases merge across providers while reserve teams remain distinct', () => {
  const context = createContext();
  context.pairs = [['Inter', 'Internazionale'], ['PSG', 'Paris Saint-Germain'], ['Athletic Bilbao', 'Athletic Club'], ['Sporting Lisbon', 'Sporting CP'], ['Mainz', '1. FSV Mainz 05'], ["M'gladbach", 'Borussia Mönchengladbach']];
  assert.deepEqual([...vm.runInContext('pairs.map(([left, right]) => _footballTrackerEquivalentTeamNames(left, right))', context)], [true, true, true, true, true, true]);
  assert.equal(vm.runInContext("_footballTrackerCompatibleTeamType('FC Bayern München', 'Bayern München II')", context), false);
  assert.equal(vm.runInContext("_footballTrackerCompatibleTeamType('Barcelona', 'Barcelona B')", context), false);
});

test('ambiguous competition labels do not default to the first country', () => {
  const context = createContext();
  context.value = { provider: 'sportmonks', name: 'League Cup', area: '' };
  const canonical = vm.runInContext('_footballTrackerCanonicalCompetition(value)', context);
  assert.equal(canonical.known, null);
  assert.equal(canonical.key, ':league cup');
});

test('team country resolves an area-less domestic competition in history', () => {
  const context = createContext(); context.team = { id: 1, name: 'Celtic', provider: 'sportmonks', area: 'Scotland' };
  context.matches = [{ id: 1, utcDate: Date.parse('2026-08-20T19:00:00Z'), status: 'FINISHED', home: { id: 1, name: 'Celtic' }, away: { id: 2, name: 'Rangers' }, homeScore: 2, awayScore: 1, competition: { provider: 'sportmonks', name: 'League Cup', area: '' } }];
  const group = vm.runInContext("_footballTrackerBuildTeamHistory(matches, team, { sportmonks: 1 }, 'SCO-PL', Date.parse('2026-09-01T00:00:00Z')).groups[0]", context);
  assert.equal(group.key, 'SCO-LC');
  assert.equal(group.name, 'League Cup');
});

test('supplemental teams retain their provider when opening history', () => {
  const context = createContext();
  context.payload = { events: [{ idEvent: '1', strTimestamp: '2026-09-01T18:00:00', strStatus: 'NS', idLeague: '4485', strLeague: 'DFB-Pokal', idHomeTeam: '133664', strHomeTeam: 'Bayern Munich', idAwayTeam: '133650', strAwayTeam: 'Borussia Dortmund' }] };
  context.widget = widget({ competitionCode: 'DEU-DFB' });
  vm.runInContext("const match = _footballTrackerTheSportsDbMatches(payload)[0]; _footballTrackerOpenTeamHistory(widget, match.home)", context);
  const selected = vm.runInContext('_footballTrackerState(widget).selectedTeam', context);
  assert.equal(selected.provider, 'theSportsDb');
  assert.equal(selected.id, 133664);
});

test('TheSportsDB country aliases resolve Dutch teams', async () => {
  const context = createContext({
    _fetchWithTimeout: async url => {
      assert.match(url, /searchteams\.php\?t=Ajax$/);
      return { ok: true, json: async () => ({ teams: [{ idTeam: '133772', strTeam: 'Ajax', strCountry: 'The Netherlands', idLeague: '4337', strLeague: 'Dutch Eredivisie' }] }) };
    }
  });
  context.widget = widget({ competitionCode: 'DED' }); context.team = { id: 678, name: 'Ajax', provider: 'footballData', area: 'Netherlands', competitionCode: 'DED' };
  const resolved = await vm.runInContext('_footballTrackerResolveTheSportsDbTeam(widget, team, 2026)', context);
  assert.equal(resolved.id, 133772);
  assert.equal(resolved.provider, 'theSportsDb');
});

test('API-Football resolver refuses a reserve team as the senior club', async () => {
  const context = createContext({
    _fetchWithTimeout: async () => ({ ok: true, json: async () => ({ response: [{ team: { id: 999, name: 'Bayern München II', country: 'Germany' } }] }) })
  });
  context.widget = widget({ competitionCode: 'BL1' }); context.team = { id: 5, name: 'FC Bayern München', provider: 'footballData', area: 'Germany', competitionCode: 'BL1' };
  await assert.rejects(vm.runInContext('_footballTrackerResolveApiFootballTeam(widget, team)', context), /could not find FC Bayern München/);
});

test('Sportmonks team fixtures follow every pagination page', async () => {
  const context = createContext(); const paths = [];
  context.paths = paths;
  vm.runInContext(`_footballTrackerProviderRequest = async (_widget, _competition, path) => {
    paths.push(path); const page = Number(new URL('https://example.test/?' + path.split('?')[1]).searchParams.get('page'));
    return { data: [{ id: page }], pagination: { current_page: page, last_page: 2, has_more: page < 2 } };
  }`, context);
  context.widget = widget({ competitionCode: 'SCO-PL' });
  const payload = await vm.runInContext("_footballTrackerSportmonksPagedRequest(widget, _footballTrackerCompetition(widget), 'fixtures/between/2026-07-01/2027-06-30/1?include=participants')", context);
  assert.deepEqual([...payload.data].map(entry => entry.id), [1, 2]);
  assert.equal(paths.length, 2);
  assert.ok(paths.every(path => path.includes('per_page=50')));
});

test('provider metadata and team associations are season-scoped', () => {
  const context = createContext(); context.competition = { provider: 'apiFootball', code: 'DEU-DFB' }; context.team = { provider: 'footballData', id: 5, name: 'FC Bayern München' };
  assert.notEqual(vm.runInContext('_footballTrackerProviderMetaCacheKey(competition, 2025)', context), vm.runInContext('_footballTrackerProviderMetaCacheKey(competition, 2026)', context));
  assert.notEqual(vm.runInContext('_footballTrackerTheSportsDbTeamLinkCacheKey(team, 2025)', context), vm.runInContext('_footballTrackerTheSportsDbTeamLinkCacheKey(team, 2026)', context));
});

test('live and postponed fixtures remain visible in team history', () => {
  const context = createContext(); const now = Date.parse('2026-09-01T20:00:00Z');
  context.now = now; context.team = { id: 1, name: 'Ajax', provider: 'footballData' };
  context.matches = [
    { id: 1, utcDate: now - 3600000, status: 'IN_PLAY', home: { id: 1, name: 'Ajax' }, away: { id: 2, name: 'PSV' }, homeScore: 1, awayScore: 0, competition: { provider: 'footballData', code: 'DED', name: 'Eredivisie', area: 'Netherlands' } },
    { id: 2, utcDate: now - 86400000, status: 'POSTPONED', home: { id: 3, name: 'Feyenoord' }, away: { id: 1, name: 'Ajax' }, homeScore: null, awayScore: null, competition: { provider: 'footballData', code: 'DED', name: 'Eredivisie', area: 'Netherlands' } }
  ];
  const group = vm.runInContext("_footballTrackerBuildTeamHistory(matches, team, { footballData: 1 }, 'DED', now).groups[0]", context);
  assert.deepEqual([...group.upcoming].map(match => match.status).sort(), ['IN_PLAY', 'POSTPONED']);
});

test('an empty limited fallback does not hide a primary-provider failure', async () => {
  const context = createContext(); context.widget = widget({ competitionCode: 'DEU-DFB' }); context.competition = vm.runInContext('_footballTrackerCompetition(widget)', context);
  vm.runInContext("_footballTrackerCompetitionPayload = async () => { throw new Error('primary unavailable'); }; _footballTrackerTheSportsDbCompetitionMatches = async () => [];", context);
  await assert.rejects(vm.runInContext("_footballTrackerCompetitionData(widget, competition, 'matches')", context), /primary unavailable/);
});

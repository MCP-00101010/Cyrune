// --- Football Tracker widget ----------------------------------------------
// Portable preferences only. Provider responses and bounded per-instance view
// state use the Widget SDK cache; neither enters the shared database.

const FOOTBALL_TRACKER_COMPETITIONS = Object.freeze([
  { area: 'England', code: 'PL', name: 'Premier League', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4328, aliases: ['English Premier League', 'English Premiere League', 'English Premiership'] },
  { area: 'England', code: 'ELC', name: 'Championship', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4329, aliases: ['English League Championship', 'England EFL Championship', 'English Football League Championship', 'EFL Championship'] },
  { area: 'England', code: 'ENG-FAC', name: 'FA Cup', kind: 'cup', provider: 'apiFootball', apiCountry: 'England', apiSearch: 'FA Cup', theSportsDbLeagueId: 4482, theSportsDbFallback: true, aliases: ['English FA Cup', 'The Emirates FA Cup', 'Football Association Cup'], hasStandings: false },
  { area: 'England', code: 'ENG-LC', name: 'League Cup', kind: 'cup', provider: 'apiFootball', apiCountry: 'England', apiSearch: 'League Cup', theSportsDbLeagueId: 4570, theSportsDbFallback: true, aliases: ['EFL Cup', 'Carabao Cup', 'Football League Cup', 'English League Cup'], hasStandings: false },
  { area: 'Scotland', code: 'SCO-PL', name: 'Premiership', kind: 'league', provider: 'sportmonks', leagueId: 501, theSportsDbLeagueId: 4330, aliases: ['Scottish Premiership', 'Scottish Premier League'] },
  { area: 'Scotland', code: 'SCO-FAC', name: 'Scottish Cup', kind: 'cup', provider: 'apiFootball', apiCountry: 'Scotland', apiSearch: 'FA Cup', theSportsDbLeagueId: 4723, theSportsDbFallback: true, aliases: ['Scottish FA Cup'], hasStandings: false },
  { area: 'Scotland', code: 'SCO-LC', name: 'League Cup', kind: 'cup', provider: 'apiFootball', apiCountry: 'Scotland', apiSearch: 'League Cup', theSportsDbLeagueId: 4888, theSportsDbFallback: true, aliases: ['Scottish League Cup'], hasStandings: false },
  { area: 'Germany', code: 'BL1', name: 'Bundesliga', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4331, aliases: ['German Bundesliga', 'Fußball-Bundesliga'] },
  { area: 'Germany', code: 'DEU-DFB', name: 'DFB-Pokal', kind: 'cup', provider: 'apiFootball', apiCountry: 'Germany', apiSearch: 'DFB Pokal', theSportsDbLeagueId: 4485, theSportsDbFallback: true, aliases: ['DFB Cup'], hasStandings: false },
  { area: 'Spain', code: 'PD', name: 'La Liga', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4335, aliases: ['Spanish La Liga', 'LaLiga EA Sports'] },
  { area: 'Spain', code: 'ESP-CDR', name: 'Copa del Rey', kind: 'cup', provider: 'apiFootball', apiCountry: 'Spain', apiSearch: 'Copa del Rey', theSportsDbLeagueId: 4483, theSportsDbFallback: true, aliases: ['Spanish Cup'], hasStandings: false },
  { area: 'Italy', code: 'SA', name: 'Serie A', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4332, aliases: ['Italian Serie A', 'Italy Serie A'] },
  { area: 'Italy', code: 'ITA-CIT', name: 'Coppa Italia', kind: 'cup', provider: 'apiFootball', apiCountry: 'Italy', apiSearch: 'Coppa Italia', theSportsDbLeagueId: 4506, theSportsDbFallback: true, hasStandings: false },
  { area: 'France', code: 'FL1', name: 'Ligue 1', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4334, aliases: ['French Ligue 1', 'Ligue 1 Conforama France'] },
  { area: 'France', code: 'FRA-CDF', name: 'Coupe de France', kind: 'cup', provider: 'apiFootball', apiCountry: 'France', apiSearch: 'Coupe de France', theSportsDbLeagueId: 4484, theSportsDbFallback: true, aliases: ['French Cup'], hasStandings: false },
  { area: 'Netherlands', code: 'DED', name: 'Eredivisie', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4337, aliases: ['Dutch Eredivisie'] },
  { area: 'Netherlands', code: 'NLD-KNV', name: 'KNVB Beker', kind: 'cup', provider: 'apiFootball', apiCountry: 'Netherlands', apiSearch: 'KNVB Beker', theSportsDbLeagueId: 4902, theSportsDbFallback: true, aliases: ['Dutch KNVB Cup', 'KNVB Cup'], hasStandings: false },
  { area: 'Portugal', code: 'PPL', name: 'Primeira Liga', kind: 'league', provider: 'footballData', theSportsDbLeagueId: 4344, aliases: ['Portuguese Primeira Liga', 'Liga NOS', 'Liga Portugal Betclic'] },
  { area: 'Portugal', code: 'PRT-TDP', name: 'Taça de Portugal', kind: 'cup', provider: 'apiFootball', apiCountry: 'Portugal', apiSearch: 'Taça de Portugal', theSportsDbLeagueId: 4510, theSportsDbFallback: true, aliases: ['Taca de Portugal'], hasStandings: false },
  { area: 'Denmark', code: 'DNK-SL', name: 'Superliga', kind: 'league', provider: 'sportmonks', leagueId: 271, theSportsDbLeagueId: 4340, aliases: ['Danish Superliga'] },
  { area: 'Europe', code: 'CL', name: 'Champions League', kind: 'cup', provider: 'footballData', theSportsDbLeagueId: 4480, theSportsDbFallback: true, aliases: ['UEFA Champions League'] },
  { area: 'Europe', code: 'EUR-EL', name: 'Europa League', kind: 'cup', provider: 'apiFootball', apiSearch: 'UEFA Europa League', theSportsDbLeagueId: 4481, theSportsDbFallback: true },
  { area: 'Europe', code: 'EUR-ECL', name: 'Conference League', kind: 'cup', provider: 'apiFootball', apiSearch: 'UEFA Conference League', theSportsDbLeagueId: 5071, theSportsDbFallback: true, aliases: ['UEFA Europa Conference League'] },
  { area: 'Europe', code: 'EC', name: 'European Championship', kind: 'cup', provider: 'footballData', theSportsDbLeagueId: 4502, aliases: ['Euro Championship', 'UEFA European Championship', 'UEFA European Championships', 'UEFA Euro'] },
  { area: 'World', code: 'WC', name: 'FIFA World Cup', kind: 'cup', provider: 'footballData', theSportsDbLeagueId: 4429, aliases: ['World Cup'] }
]);
const FOOTBALL_TRACKER_MAX_MATCHES = 600;
const FOOTBALL_TRACKER_MAX_FAVOURITE_TEAMS = 32;
const FOOTBALL_TRACKER_UPCOMING_LIMIT_OPTIONS = Object.freeze([5, 10, 0]);
const FOOTBALL_TRACKER_PROVIDER_META_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FOOTBALL_TRACKER_TEAM_LINK_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const FOOTBALL_TRACKER_FOOTBALL_DATA_SEASONAL_CODES = new Set(['PL', 'ELC', 'BL1', 'PD', 'SA', 'FL1', 'DED', 'PPL', 'CL']);
const FOOTBALL_TRACKER_COMPLETE_TEAM_NAMES = Object.freeze({
  hearts: 'Heart of Midlothian',
  'heart of midlothian': 'Heart of Midlothian',
  inter: 'Inter Milan', internazionale: 'Inter Milan', 'inter milan': 'Inter Milan', 'fc internazionale milano': 'Inter Milan',
  psg: 'Paris Saint-Germain FC', 'paris saint germain': 'Paris Saint-Germain FC', 'paris saint germain fc': 'Paris Saint-Germain FC',
  'athletic bilbao': 'Athletic Club', 'athletic club': 'Athletic Club',
  'sporting lisbon': 'Sporting CP', 'sporting cp': 'Sporting CP',
  mainz: '1. FSV Mainz 05', 'fsv mainz': '1. FSV Mainz 05', '1 fsv mainz 05': '1. FSV Mainz 05',
  'm gladbach': 'Borussia Mönchengladbach', 'borussia m gladbach': 'Borussia Mönchengladbach', 'borussia monchengladbach': 'Borussia Mönchengladbach',
  stuttgart: 'VfB Stuttgart', 'vfb stuttgart': 'VfB Stuttgart',
  schalke: 'FC Schalke 04', 'schalke 04': 'FC Schalke 04', 'fc schalke 04': 'FC Schalke 04',
  'bayern munich': 'FC Bayern München', 'bayern munchen': 'FC Bayern München', 'bayern muenchen': 'FC Bayern München', 'fc bayern munich': 'FC Bayern München', 'fc bayern munchen': 'FC Bayern München', 'fc bayern muenchen': 'FC Bayern München'
});
const FOOTBALL_TRACKER_PROVIDERS = Object.freeze({
  footballData: Object.freeze({ name: 'football-data.org', secret: 'footballData', href: 'https://www.football-data.org/' }),
  sportmonks: Object.freeze({ name: 'Sportmonks', secret: 'sportmonks', href: 'https://www.sportmonks.com/football-api/' }),
  apiFootball: Object.freeze({ name: 'API-Football', secret: 'apiFootball', href: 'https://www.api-football.com/' }),
  theSportsDb: Object.freeze({ name: 'TheSportsDB', secret: '', href: 'https://www.thesportsdb.com/' })
});
const _footballTrackerRuntime = new Map();
const _footballTrackerSharedLoads = new Map();
const _footballTrackerPublicLoads = new Map();
const _footballTrackerViewMemory = new Map();

function _footballTrackerLocalDateKey(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function _footballTrackerMsUntilDateChange(now = Date.now()) {
  const date = new Date(now);
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.max(1000, tomorrow.getTime() - now + 1000);
}

function _footballTrackerSeasonYear(now = Date.now()) {
  const date = new Date(now);
  return date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
}

function _footballTrackerCompetition(value) {
  const code = typeof value === 'object' ? value?.config?.competitionCode : value;
  return FOOTBALL_TRACKER_COMPETITIONS.find(competition => competition.code === code) || FOOTBALL_TRACKER_COMPETITIONS[0];
}

function _footballTrackerConfig(widget) {
  widget.config = widget.config || {};
  const competition = _footballTrackerCompetition(widget);
  widget.config.competitionCode = competition.code;
  widget.config.defaultView = ['matches', 'standings'].includes(widget.config.defaultView) ? widget.config.defaultView : 'matches';
  if (competition.hasStandings === false) widget.config.defaultView = 'matches';
  widget.config.showCrests = widget.config.showCrests !== false;
  const legacyUpcomingDays = Number(widget.config.historyUpcomingDays);
  const upcomingLimit = Number(widget.config.historyUpcomingLimit);
  widget.config.historyUpcomingLimit = FOOTBALL_TRACKER_UPCOMING_LIMIT_OPTIONS.includes(upcomingLimit)
    ? upcomingLimit
    : (legacyUpcomingDays === 0 ? 0 : 5);
  delete widget.config.historyUpcomingDays;
  const favouriteTeams = Array.isArray(widget.config.favouriteTeams) ? widget.config.favouriteTeams : [];
  const normalized = []; const seen = new Set();
  favouriteTeams.slice(0, FOOTBALL_TRACKER_MAX_FAVOURITE_TEAMS).forEach(value => {
    const source = value && typeof value === 'object' ? value : { name: value };
    const name = _footballTrackerCompleteTeamName(source.name).slice(0, 100); const id = Math.max(0, Number(source.id) || 0);
    if (!name) return;
    const provider = String(source.provider || '').slice(0, 30);
    const key = id ? `id:${provider}:${id}` : `name:${_footballTrackerComparableTeamName(name)}`;
    if (!key.endsWith(':') && !seen.has(key)) {
      seen.add(key); normalized.push({ id, name, provider });
    }
  });
  const legacyFavourite = _footballTrackerCompleteTeamName(widget.config.favouriteTeam).slice(0, 80);
  if (legacyFavourite && !normalized.some(team => _footballTrackerComparableTeamName(team.name) === _footballTrackerComparableTeamName(legacyFavourite))) {
    normalized.push({ id: 0, name: legacyFavourite, provider: '' });
  }
  widget.config.favouriteTeams = normalized.slice(0, FOOTBALL_TRACKER_MAX_FAVOURITE_TEAMS);
  widget.config.favouriteTeam = '';
  return widget.config;
}

function _footballTrackerNormalizeView(widget, value) {
  const config = _footballTrackerConfig(widget); const source = value && typeof value === 'object' ? value : {};
  if (source.competitionCode && source.competitionCode !== config.competitionCode) return null;
  const selected = source.selectedTeam && typeof source.selectedTeam === 'object' ? source.selectedTeam : null;
  const selectedLookupName = _footballTrackerCompleteTeamName(selected?.lookupName);
  const selectedTeam = selected && Number(selected.id) > 0 && selectedLookupName ? {
    id: Number(selected.id), name: selectedLookupName.slice(0, 100), lookupName: selectedLookupName.slice(0, 140), crest: /^https:\/\//i.test(String(selected.crest || '')) ? String(selected.crest).slice(0, 500) : '',
    provider: String(selected.provider || '').slice(0, 30), area: String(selected.area || '').slice(0, 80), competitionCode: String(selected.competitionCode || config.competitionCode).slice(0, 30)
  } : null;
  return {
    competitionCode: config.competitionCode,
    view: ['matches', 'standings'].includes(source.view) && _footballTrackerCompetition(widget).hasStandings !== false ? source.view : config.defaultView,
    roundKey: String(source.roundKey || '').slice(0, 100), historyTabKey: String(source.historyTabKey || '').slice(0, 120),
    historySort: source.historySort === 'oldest' ? 'oldest' : 'newest', selectedTeam
  };
}

function _footballTrackerReadView(widget) {
  let view = _footballTrackerViewMemory.get(widget.id) || null;
  if (!view) {
    view = _footballTrackerNormalizeView(widget, WidgetSDK.cache.get('footballTracker', widget.id, 'view'));
    if (view) _footballTrackerViewMemory.set(widget.id, view);
  }
  return view;
}

function _footballTrackerWriteView(widget, runtime) {
  const view = _footballTrackerNormalizeView(widget, runtime);
  if (!view) return null;
  _footballTrackerViewMemory.set(widget.id, view);
  try { WidgetSDK.cache.set('footballTracker', widget.id, 'view', view); } catch {}
  return view;
}

function _footballTrackerState(widget) {
  const config = _footballTrackerConfig(widget);
  let runtime = _footballTrackerRuntime.get(widget.id);
  if (!runtime) {
    const view = _footballTrackerReadView(widget);
    runtime = { view: view?.view || config.defaultView, competitionCode: config.competitionCode, dateKey: _footballTrackerLocalDateKey(), roundKey: view?.roundKey || '', historyTabKey: view?.historyTabKey || '', historySort: view?.historySort || 'newest', selectedTeam: view?.selectedTeam || null, loading: {}, errors: {}, warnings: {}, data: {}, providers: {} };
    _footballTrackerRuntime.set(widget.id, runtime);
  }
  if (runtime.competitionCode !== config.competitionCode) {
    runtime.competitionCode = config.competitionCode;
    runtime.roundKey = '';
    runtime.view = config.defaultView;
    runtime.historyTabKey = '';
    runtime.selectedTeam = null;
    runtime.loading = {};
    runtime.errors = {};
    runtime.warnings = {};
    runtime.data = {};
    runtime.providers = {};
    _footballTrackerWriteView(widget, runtime);
  }
  runtime.providers ||= {};
  runtime.warnings ||= {};
  return runtime;
}

function _footballTrackerTeam(value) {
  const name = _footballTrackerCompleteTeamName(value?.name || value?.lookupName || value?.shortName || 'TBC').slice(0, 100);
  const lookupName = _footballTrackerCompleteTeamName(value?.lookupName || value?.name || name).slice(0, 140);
  return {
    id: Number(value?.id) || 0, name, lookupName,
    provider: String(value?.provider || '').slice(0, 30),
    crest: /^https:\/\//i.test(String(value?.crest || '')) ? String(value.crest).slice(0, 500) : ''
  };
}

function _footballTrackerPlainName(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function _footballTrackerCompleteTeamName(value) {
  const name = String(value || '').trim();
  return FOOTBALL_TRACKER_COMPLETE_TEAM_NAMES[_footballTrackerPlainName(name)] || name;
}

function _footballTrackerComparableTeamName(value) {
  return _footballTrackerPlainName(_footballTrackerCompleteTeamName(value)).replace(/\b(?:afc|cf|fc|football|club)\b/g, ' ').replace(/\b(?:munchen|muenchen)\b/g, 'munich').replace(/\s+/g, ' ').trim();
}

function _footballTrackerComparableArea(value) {
  const area = _footballTrackerPlainName(value);
  return area === 'the netherlands' ? 'netherlands' : area;
}

function _footballTrackerReserveTeamName(value) {
  const name = _footballTrackerPlainName(value);
  return /^(?:jong)\b|\b(?:reserves?|women|womens|ladies|feminin|ii|iii|b|u18|u19|u20|u21|u23)$/.test(name);
}

function _footballTrackerCompatibleTeamType(wanted, candidate) {
  return _footballTrackerReserveTeamName(wanted) || !_footballTrackerReserveTeamName(candidate);
}

function _footballTrackerEquivalentTeamNames(leftValue, rightValue) {
  const left = _footballTrackerComparableTeamName(leftValue); const right = _footballTrackerComparableTeamName(rightValue);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.length >= 4 && right.length >= 4 && (left.endsWith(` ${right}`) || right.endsWith(` ${left}`));
}

function _footballTrackerEquivalentFixtures(left, right) {
  return _footballTrackerDateKey(left?.utcDate) === _footballTrackerDateKey(right?.utcDate)
    && _footballTrackerEquivalentTeamNames(left?.home?.name, right?.home?.name)
    && _footballTrackerEquivalentTeamNames(left?.away?.name, right?.away?.name);
}

function _footballTrackerDomesticArea(value) {
  const area = _footballTrackerComparableArea(value);
  return ['europe', 'world'].includes(area) ? '' : area;
}

function _footballTrackerMatchCompetition(value, provider, fallback = {}) {
  const emblem = value?.emblem || value?.logo || fallback.emblem || '';
  const area = value?.area?.name || value?.country?.name || value?.country || fallback.area || '';
  return {
    provider,
    id: Number(value?.id || value?.league_id || fallback.id) || 0,
    code: String(value?.code || fallback.code || '').slice(0, 30),
    name: String(value?.name || fallback.name || '').slice(0, 100),
    area: String(area).slice(0, 80),
    emblem: /^https:\/\//i.test(String(emblem)) ? String(emblem).slice(0, 500) : ''
  };
}

function _footballTrackerKnownCompetition(value) {
  const code = String(value?.code || '').toUpperCase();
  const id = Number(value?.id) || 0;
  const name = _footballTrackerPlainName(value?.name);
  const area = _footballTrackerComparableArea(value?.area);
  const direct = FOOTBALL_TRACKER_COMPETITIONS.find(competition => competition.code === code)
    || FOOTBALL_TRACKER_COMPETITIONS.find(competition => competition.provider === value?.provider && Number(competition.leagueId) === id)
    || (value?.provider === 'theSportsDb' && FOOTBALL_TRACKER_COMPETITIONS.find(competition => Number(competition.theSportsDbLeagueId) === id));
  if (direct) return direct;
  const candidates = FOOTBALL_TRACKER_COMPETITIONS.filter(competition => [competition.name, competition.apiSearch, ...(competition.aliases || [])].some(alias => _footballTrackerPlainName(alias) === name));
  const areaMatch = candidates.find(competition => area && _footballTrackerComparableArea(competition.area) === area);
  if (areaMatch) return areaMatch;
  return candidates.length === 1 ? candidates[0] : null;
}

function _footballTrackerCanonicalCompetition(value) {
  const known = _footballTrackerKnownCompetition(value);
  if (known) return { key: known.code, name: known.name, area: known.area, provider: known.provider, known };
  const name = String(value?.name || '').trim().slice(0, 100);
  const area = String(value?.area || '').trim().slice(0, 80);
  return { key: `${_footballTrackerPlainName(area)}:${_footballTrackerPlainName(name)}`, name, area, provider: value?.provider || '', known: null };
}

function _footballTrackerOfficialCompetition(value) {
  const name = _footballTrackerPlainName(value?.name);
  return !!name && !/\b(?:friendly|friendlies|reserve|reserves|youth|women|womens|ladies|feminin|u18|u19|u20|u21|u23)\b/.test(name);
}

function _footballTrackerMatch(value) {
  const utcDate = Date.parse(value?.utcDate);
  if (!Number.isFinite(utcDate)) return null;
  const score = value?.score || {};
  const homeScore = score?.fullTime?.home !== null && score?.fullTime?.home !== undefined && Number.isFinite(Number(score.fullTime.home)) ? Number(score.fullTime.home) : null;
  const awayScore = score?.fullTime?.away !== null && score?.fullTime?.away !== undefined && Number.isFinite(Number(score.fullTime.away)) ? Number(score.fullTime.away) : null;
  return {
    id: Number(value?.id) || 0,
    utcDate,
    status: _footballTrackerProviderStatusWithScore(value?.status, utcDate, homeScore, awayScore),
    stage: String(value?.stage || '').slice(0, 60),
    group: String(value?.group || '').slice(0, 60),
    matchday: Math.max(0, Number.parseInt(value?.matchday, 10) || 0),
    home: _footballTrackerTeam({ ...value?.homeTeam, provider: 'footballData' }), away: _footballTrackerTeam({ ...value?.awayTeam, provider: 'footballData' }),
    homeScore, awayScore,
    winner: String(score?.winner || '').slice(0, 30),
    competition: _footballTrackerMatchCompetition(value?.competition, 'footballData')
  };
}

function _footballTrackerMatches(payload) {
  return (Array.isArray(payload?.matches) ? payload.matches : []).slice(0, FOOTBALL_TRACKER_MAX_MATCHES).map(_footballTrackerMatch).filter(Boolean).sort((left, right) => left.utcDate - right.utcDate);
}

function _footballTrackerTableRow(value) {
  const team = _footballTrackerTeam({ ...value?.team, provider: 'footballData' });
  return {
    position: Math.max(0, Number.parseInt(value?.position, 10) || 0), team,
    played: Math.max(0, Number(value?.playedGames) || 0), won: Math.max(0, Number(value?.won) || 0),
    draw: Math.max(0, Number(value?.draw) || 0), lost: Math.max(0, Number(value?.lost) || 0),
    goalsFor: Number(value?.goalsFor) || 0, goalsAgainst: Number(value?.goalsAgainst) || 0,
    goalDifference: Number(value?.goalDifference) || 0, points: Number(value?.points) || 0
  };
}

function _footballTrackerStandings(payload) {
  return (Array.isArray(payload?.standings) ? payload.standings : []).filter(standing => standing?.type === 'TOTAL' && Array.isArray(standing.table)).slice(0, 12).map(standing => ({
    stage: String(standing.stage || '').slice(0, 60), group: String(standing.group || '').replace(/^GROUP_/, 'Group ').replaceAll('_', ' ').slice(0, 60),
    table: standing.table.slice(0, 30).map(_footballTrackerTableRow)
  }));
}

function _footballTrackerProviderStatus(value) {
  const status = String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (['FT', 'AET', 'PEN', 'FT_PEN', 'FINISHED', 'MATCH_FINISHED', 'FULL_TIME', 'AFTER_EXTRA_TIME', 'AFTER_PENALTIES'].includes(status)) return 'FINISHED';
  if (['1H', '2H', 'BT', 'LIVE', 'INPLAY', 'IN_PLAY', 'INPLAY_1ST_HALF', 'INPLAY_2ND_HALF'].includes(status)) return 'IN_PLAY';
  if (['ET', 'INPLAY_ET'].includes(status)) return 'EXTRA_TIME';
  if (['P', 'INPLAY_PENALTIES', 'PENALTY_SHOOTOUT'].includes(status)) return 'PENALTY_SHOOTOUT';
  if (['HT', 'BREAK', 'HALF_TIME', 'PAUSED', 'AWAITING_UPDATES'].includes(status)) return 'PAUSED';
  if (['AWD', 'WO', 'AWARDED', 'WALK_OVER'].includes(status)) return 'AWARDED';
  if (['PST', 'POSTPONED', 'MATCH_POSTPONED'].includes(status)) return 'POSTPONED';
  if (['CANC', 'CANCELLED', 'MATCH_CANCELLED'].includes(status)) return 'CANCELLED';
  if (['ABD', 'SUSP', 'INT', 'SUSPENDED', 'ABANDONED', 'INTERRUPTED'].includes(status)) return 'SUSPENDED';
  if (status === 'DELAYED') return 'DELAYED';
  return 'SCHEDULED';
}

function _footballTrackerProviderStatusWithScore(value, timestamp, homeScore, awayScore, now = Date.now()) {
  const status = _footballTrackerProviderStatus(value);
  if (status !== 'SCHEDULED' || homeScore === null || awayScore === null) return status;
  return Number(timestamp) < now - 6 * 60 * 60 * 1000 ? 'FINISHED' : status;
}

function _footballTrackerActiveStatus(value) {
  return ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT', 'SUSPENDED', 'DELAYED'].includes(String(value || ''));
}

function _footballTrackerApiFootballMatches(payload) {
  return (Array.isArray(payload?.response) ? payload.response : []).slice(0, FOOTBALL_TRACKER_MAX_MATCHES).map(item => {
    const fixture = item?.fixture || {}; const timestamp = Number(fixture.timestamp) * 1000 || Date.parse(fixture.date);
    if (!Number.isFinite(timestamp)) return null;
    const fullTime = item?.score?.fulltime || {}; const goals = item?.goals || {};
    const scoreValue = (full, current) => full !== null && full !== undefined && Number.isFinite(Number(full)) ? Number(full) : (current !== null && current !== undefined && Number.isFinite(Number(current)) ? Number(current) : null);
    const homeScore = scoreValue(fullTime.home, goals.home); const awayScore = scoreValue(fullTime.away, goals.away);
    const round = String(item?.league?.round || ''); const roundNumber = round.match(/\d+/)?.[0] || 0;
    return {
      id: Number(fixture.id) || 0, utcDate: timestamp, status: _footballTrackerProviderStatusWithScore(fixture.status?.short || fixture.status?.long, timestamp, homeScore, awayScore),
      stage: round.slice(0, 60), group: '', matchday: Math.max(0, Number.parseInt(roundNumber, 10) || 0),
      home: _footballTrackerTeam({ id: item?.teams?.home?.id, name: item?.teams?.home?.name, crest: item?.teams?.home?.logo, provider: 'apiFootball' }),
      away: _footballTrackerTeam({ id: item?.teams?.away?.id, name: item?.teams?.away?.name, crest: item?.teams?.away?.logo, provider: 'apiFootball' }),
      homeScore, awayScore, winner: item?.teams?.home?.winner === true ? 'HOME_TEAM' : (item?.teams?.away?.winner === true ? 'AWAY_TEAM' : 'DRAW'),
      competition: _footballTrackerMatchCompetition(item?.league, 'apiFootball')
    };
  }).filter(Boolean).sort((left, right) => left.utcDate - right.utcDate);
}

function _footballTrackerApiFootballStandings(payload) {
  const groups = payload?.response?.[0]?.league?.standings;
  return (Array.isArray(groups) ? groups : []).slice(0, 12).filter(Array.isArray).map((table, index) => ({
    stage: '', group: String(table[0]?.group || (groups.length > 1 ? `Group ${index + 1}` : '')).slice(0, 60),
    table: table.slice(0, 30).map(entry => ({
      position: Math.max(0, Number(entry?.rank) || 0),
      team: _footballTrackerTeam({ id: entry?.team?.id, name: entry?.team?.name, crest: entry?.team?.logo, provider: 'apiFootball' }),
      played: Math.max(0, Number(entry?.all?.played) || 0), won: Math.max(0, Number(entry?.all?.win) || 0),
      draw: Math.max(0, Number(entry?.all?.draw) || 0), lost: Math.max(0, Number(entry?.all?.lose) || 0),
      goalsFor: Number(entry?.all?.goals?.for) || 0, goalsAgainst: Number(entry?.all?.goals?.against) || 0,
      goalDifference: Number(entry?.goalsDiff) || 0, points: Number(entry?.points) || 0
    }))
  }));
}

function _footballTrackerTheSportsDbMatches(payload) {
  const entries = payload?.results || payload?.events || payload?.event;
  return (Array.isArray(entries) ? entries : []).slice(0, FOOTBALL_TRACKER_MAX_MATCHES).map(item => {
    const rawTimestamp = String(item?.strTimestamp || `${item?.dateEvent || ''}T${item?.strTime || '00:00:00'}`);
    const timestamp = Date.parse(/(?:z|[+-]\d\d:?\d\d)$/i.test(rawTimestamp) ? rawTimestamp : `${rawTimestamp}Z`);
    if (!Number.isFinite(timestamp)) return null;
    const homeScore = item?.intHomeScore !== null && item?.intHomeScore !== undefined && Number.isFinite(Number(item.intHomeScore)) ? Number(item.intHomeScore) : null;
    const awayScore = item?.intAwayScore !== null && item?.intAwayScore !== undefined && Number.isFinite(Number(item.intAwayScore)) ? Number(item.intAwayScore) : null;
    return {
      id: Number(item?.idEvent) || 0, utcDate: timestamp, status: _footballTrackerProviderStatusWithScore(item?.strStatus, timestamp, homeScore, awayScore),
      stage: String(item?.intRound || '').slice(0, 60), group: String(item?.strGroup || '').slice(0, 60), matchday: Math.max(0, Number(item?.intRound) || 0),
      home: _footballTrackerTeam({ id: item?.idHomeTeam, name: item?.strHomeTeam, crest: item?.strHomeTeamBadge, provider: 'theSportsDb' }),
      away: _footballTrackerTeam({ id: item?.idAwayTeam, name: item?.strAwayTeam, crest: item?.strAwayTeamBadge, provider: 'theSportsDb' }),
      homeScore, awayScore, winner: homeScore === null || awayScore === null ? '' : (homeScore > awayScore ? 'HOME_TEAM' : (awayScore > homeScore ? 'AWAY_TEAM' : 'DRAW')),
      competition: _footballTrackerMatchCompetition({ id: item?.idLeague, name: item?.strLeague, emblem: item?.strLeagueBadge }, 'theSportsDb')
    };
  }).filter(Boolean).sort((left, right) => left.utcDate - right.utcDate);
}

function _footballTrackerSportmonksFixtures(payload) {
  if (Array.isArray(payload?.data?.fixtures)) return payload.data.fixtures;
  if (Array.isArray(payload?.data)) return payload.data.flatMap(entry => {
    if (entry?.starting_at || entry?.starting_at_timestamp || Array.isArray(entry?.participants)) return [entry];
    return (entry?.rounds || []).flatMap(round => (round?.fixtures || []).map(fixture => ({ ...fixture, league_id: fixture?.league_id || entry?.league_id, stage: fixture.stage || entry, round: fixture.round || round })));
  });
  return [];
}

function _footballTrackerSportmonksScore(scores, side) {
  const candidates = (Array.isArray(scores) ? scores : []).filter(item => String(item?.score?.participant || item?.participant || '').toLowerCase() === side);
  const current = candidates.find(item => String(item?.description || '').toUpperCase() === 'CURRENT') || candidates.at(-1);
  const value = current?.score?.goals ?? current?.goals;
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

function _footballTrackerSportmonksMatches(payload) {
  return _footballTrackerSportmonksFixtures(payload).slice(0, FOOTBALL_TRACKER_MAX_MATCHES).map(fixture => {
    const timestamp = Number(fixture?.starting_at_timestamp) * 1000 || Date.parse(String(fixture?.starting_at || '').replace(' ', 'T') + 'Z');
    if (!Number.isFinite(timestamp)) return null;
    const participants = Array.isArray(fixture?.participants) ? fixture.participants : [];
    const location = participant => String(participant?.meta?.location || participant?.location || '').toLowerCase();
    const home = participants.find(participant => location(participant) === 'home') || participants[0];
    const away = participants.find(participant => location(participant) === 'away') || participants[1];
    const roundName = String(fixture?.round?.name || fixture?.round_name || '');
    const providerState = fixture?.state?.developer_name || fixture?.state?.short_name || fixture?.state?.name || (fixture?.result_info ? 'FT' : 'NS');
    const leagueId = Number(fixture?.league_id || fixture?.league?.id) || 0;
    const knownCompetition = FOOTBALL_TRACKER_COMPETITIONS.find(competition => competition.provider === 'sportmonks' && Number(competition.leagueId) === leagueId);
    const homeScore = _footballTrackerSportmonksScore(fixture?.scores, 'home'); const awayScore = _footballTrackerSportmonksScore(fixture?.scores, 'away');
    return {
      id: Number(fixture?.id) || 0, utcDate: timestamp,
      status: _footballTrackerProviderStatusWithScore(providerState, timestamp, homeScore, awayScore),
      stage: String(fixture?.stage?.name || '').slice(0, 60), group: String(fixture?.group?.name || '').slice(0, 60),
      matchday: Math.max(0, Number.parseInt(roundName.match(/\d+/)?.[0], 10) || 0),
      home: _footballTrackerTeam({ id: home?.id, name: home?.name, crest: home?.image_path, provider: 'sportmonks' }),
      away: _footballTrackerTeam({ id: away?.id, name: away?.name, crest: away?.image_path, provider: 'sportmonks' }),
      homeScore, awayScore, winner: '',
      competition: _footballTrackerMatchCompetition(fixture?.league, 'sportmonks', { id: leagueId, name: knownCompetition?.name, area: knownCompetition?.area })
    };
  }).filter(Boolean).sort((left, right) => left.utcDate - right.utcDate);
}

function _footballTrackerSportmonksDetail(entry, typeIds, patterns = []) {
  const detail = (Array.isArray(entry?.details) ? entry.details : []).find(item => {
    if (typeIds.includes(Number(item?.type_id || item?.type?.id))) return true;
    const label = String(item?.type?.developer_name || item?.type?.code || item?.type?.name || '').toLowerCase().replace(/[^a-z]+/g, '');
    return patterns.some(pattern => label.includes(pattern));
  });
  if (!detail) return null;
  const value = detail?.value?.all ?? detail?.value?.total ?? detail?.value;
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

function _footballTrackerSportmonksStandings(payload) {
  const entries = Array.isArray(payload?.data) ? payload.data : [];
  const grouped = new Map();
  entries.forEach(entry => {
    const key = `${entry?.stage_id || 0}:${entry?.group_id || 0}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  });
  return [...grouped.values()].slice(0, 12).map(entriesForTable => ({
    stage: String(entriesForTable[0]?.stage?.name || '').slice(0, 60), group: String(entriesForTable[0]?.group?.name || '').slice(0, 60),
    table: entriesForTable.sort((left, right) => Number(left?.position) - Number(right?.position)).slice(0, 30).map(entry => {
      const played = _footballTrackerSportmonksDetail(entry, [129], ['matchesplayed', 'matchedplayed', 'overallmatches']) ?? 0;
      const goalsFor = _footballTrackerSportmonksDetail(entry, [133], ['goalsfor', 'goalsscored']) ?? 0;
      const goalsAgainst = _footballTrackerSportmonksDetail(entry, [134], ['goalsagainst', 'goalsconceded', 'conceded']) ?? 0;
      const goalDifference = _footballTrackerSportmonksDetail(entry, [179], ['goaldifference']);
      return {
        position: Math.max(0, Number(entry?.position) || 0),
        team: _footballTrackerTeam({ id: entry?.participant?.id || entry?.participant_id, name: entry?.participant?.name, crest: entry?.participant?.image_path, provider: 'sportmonks' }),
        played, won: _footballTrackerSportmonksDetail(entry, [130], ['matcheswon', 'gameswon', 'wins']) ?? 0,
        draw: _footballTrackerSportmonksDetail(entry, [131], ['matchesdrawn', 'gamesdrawn', 'draws']) ?? 0,
        lost: _footballTrackerSportmonksDetail(entry, [132], ['matcheslost', 'gameslost', 'losses']) ?? 0,
        goalsFor, goalsAgainst, goalDifference: goalDifference ?? (goalsFor - goalsAgainst), points: Number(entry?.points) || 0
      };
    })
  }));
}

function _footballTrackerNormalize(payload, provider, kind) {
  if (provider === 'apiFootball') return kind === 'matches' ? _footballTrackerApiFootballMatches(payload) : _footballTrackerApiFootballStandings(payload);
  if (provider === 'sportmonks') return kind === 'matches' ? _footballTrackerSportmonksMatches(payload) : _footballTrackerSportmonksStandings(payload);
  if (provider === 'theSportsDb') return kind === 'matches' ? _footballTrackerTheSportsDbMatches(payload) : [];
  return kind === 'matches' ? _footballTrackerMatches(payload) : _footballTrackerStandings(payload);
}

function _footballTrackerHistoryTeamSide(match, team, providerTeamIds = {}) {
  const providerId = Number(providerTeamIds[match?.competition?.provider]) || 0;
  if (providerId && match?.home?.id === providerId) return 'home';
  if (providerId && match?.away?.id === providerId) return 'away';
  const wanted = _footballTrackerComparableTeamName(team?.name);
  if (wanted && _footballTrackerComparableTeamName(match?.home?.name) === wanted) return 'home';
  if (wanted && _footballTrackerComparableTeamName(match?.away?.name) === wanted) return 'away';
  return '';
}

function _footballTrackerBuildTeamHistory(matches, team, providerTeamIds, currentCompetitionCode, now = Date.now()) {
  const buckets = new Map();
  (Array.isArray(matches) ? matches : []).forEach(match => {
    if (!_footballTrackerOfficialCompetition(match?.competition)) return;
    const fallbackArea = _footballTrackerDomesticArea(team?.area) ? team.area : '';
    const competitionIdentity = { ...match.competition, area: match?.competition?.area || fallbackArea };
    const canonical = _footballTrackerCanonicalCompetition(competitionIdentity);
    if (!canonical.key || !_footballTrackerHistoryTeamSide(match, team, providerTeamIds)) return;
    if (!buckets.has(canonical.key)) buckets.set(canonical.key, { canonical, providers: new Map() });
    const providers = buckets.get(canonical.key).providers;
    const provider = match.competition.provider || team.provider;
    if (!providers.has(provider)) providers.set(provider, []);
    providers.get(provider).push(match);
  });
  const groups = [...buckets.values()].map(bucket => {
    const preferredProvider = bucket.canonical.known?.provider;
    const providerOrder = [...new Set([preferredProvider, team.provider, ...bucket.providers.keys()].filter(provider => bucket.providers.has(provider)))];
    const completed = match => ['FINISHED', 'AWARDED'].includes(match?.status);
    const scheduled = match => _footballTrackerActiveStatus(match?.status) || match?.status === 'POSTPONED' || (match?.status === 'SCHEDULED' && Number(match?.utcDate) >= now);
    const toRow = match => {
      const side = _footballTrackerHistoryTeamSide(match, team, providerTeamIds);
      const isHome = side === 'home'; const forScore = isHome ? match.homeScore : match.awayScore; const againstScore = isHome ? match.awayScore : match.homeScore;
      return {
        id: match.id, utcDate: match.utcDate, venue: isHome ? 'H' : 'A', opponent: isHome ? match.away : match.home,
        homeScore: match.homeScore, awayScore: match.awayScore, forScore, againstScore,
        status: match.status,
        result: forScore === null || againstScore === null ? '' : (forScore > againstScore ? 'W' : (forScore < againstScore ? 'L' : 'D'))
      };
    };
    const mergeProviderRows = predicate => {
      const rows = []; const seen = []; const providers = [];
      providerOrder.forEach(provider => {
        (bucket.providers.get(provider) || []).filter(predicate).forEach(match => {
          const side = _footballTrackerHistoryTeamSide(match, team, providerTeamIds);
          const opponent = side === 'home' ? match.away : match.home;
          const date = _footballTrackerDateKey(match.utcDate);
          if (seen.some(entry => entry.date === date && entry.side === side && _footballTrackerEquivalentTeamNames(entry.opponent, opponent?.name))) return;
          seen.push({ date, side, opponent: opponent?.name }); rows.push(toRow(match));
          if (!providers.includes(provider)) providers.push(provider);
        });
      });
      return { rows, providers };
    };
    const completedRows = mergeProviderRows(completed); const scheduledRows = mergeProviderRows(scheduled);
    const rows = completedRows.rows.sort((left, right) => right.utcDate - left.utcDate);
    const upcoming = scheduledRows.rows.sort((left, right) => left.utcDate - right.utcDate);
    const providers = [...new Set([...completedRows.providers, ...scheduledRows.providers])];
    return { key: bucket.canonical.key, name: bucket.canonical.name, area: bucket.canonical.area, provider: providers[0] || '', providers, matches: rows, upcoming };
  }).sort((left, right) => {
    if (left.key === currentCompetitionCode) return -1;
    if (right.key === currentCompetitionCode) return 1;
    const leftActivity = left.upcoming[0]?.utcDate || left.matches[0]?.utcDate || 0;
    const rightActivity = right.upcoming[0]?.utcDate || right.matches[0]?.utcDate || 0;
    return rightActivity - leftActivity || left.name.localeCompare(right.name);
  });
  return { team, groups, providers: [...new Set(groups.flatMap(group => group.providers))] };
}

function _footballTrackerDateKey(timestamp) { return new Date(timestamp).toISOString().slice(0, 10); }
function _footballTrackerSeasonDateRange(seasonYear) { return { start: `${seasonYear}-07-01`, end: `${seasonYear + 1}-06-30` }; }
function _footballTrackerStageLabel(value) { return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase()); }

function _footballTrackerRounds(matches, competition) {
  const grouped = new Map();
  for (const match of matches) {
    const key = competition.kind === 'cup' ? _footballTrackerDateKey(match.utcDate) : String(match.matchday || _footballTrackerDateKey(match.utcDate));
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(match);
  }
  return [...grouped.entries()].map(([key, items]) => ({
    key, matches: items,
    timestamp: Math.min(...items.map(match => match.utcDate)),
    label: competition.kind === 'cup'
      ? new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      : `Matchday ${key}`
  })).sort((left, right) => competition.kind === 'cup' ? left.timestamp - right.timestamp : Number(left.key) - Number(right.key));
}

function _footballTrackerDefaultRound(rounds, now = Date.now()) {
  if (!rounds.length) return null;
  const active = rounds.find(round => round.matches.some(match => _footballTrackerActiveStatus(match.status)));
  if (active) return active;
  return rounds.find(round => round.matches.some(match => match.utcDate >= now - 6 * 60 * 60 * 1000 && !['FINISHED', 'AWARDED', 'CANCELLED'].includes(match.status))) || rounds.at(-1);
}

function _footballTrackerFavourite(widget, team) {
  const candidate = team && typeof team === 'object' ? team : { name: team };
  const id = Math.max(0, Number(candidate.id) || 0); const name = _footballTrackerComparableTeamName(candidate.name); const provider = String(candidate.provider || '');
  return _footballTrackerConfig(widget).favouriteTeams.some(favourite => {
    const favouriteId = Math.max(0, Number(favourite.id) || 0); const favouriteProvider = String(favourite.provider || '');
    const providerIdMatch = id && favouriteId && id === favouriteId && (!provider || !favouriteProvider || provider === favouriteProvider);
    return providerIdMatch || (!!name && name === _footballTrackerComparableTeamName(favourite.name));
  });
}

function _footballTrackerToggleFavourite(widget, team) {
  if (!team?.name) return false;
  const config = _footballTrackerConfig(widget); const wasFavourite = _footballTrackerFavourite(widget, team);
  if (wasFavourite) {
    const id = Math.max(0, Number(team.id) || 0); const name = _footballTrackerComparableTeamName(team.name); const provider = String(team.provider || '');
    config.favouriteTeams = config.favouriteTeams.filter(favourite => {
      const favouriteId = Math.max(0, Number(favourite.id) || 0); const favouriteProvider = String(favourite.provider || '');
      const providerIdMatch = id && favouriteId && id === favouriteId && (!provider || !favouriteProvider || provider === favouriteProvider);
      return !(providerIdMatch || (!!name && name === _footballTrackerComparableTeamName(favourite.name)));
    });
  } else if (config.favouriteTeams.length < FOOTBALL_TRACKER_MAX_FAVOURITE_TEAMS) {
    config.favouriteTeams.push({ id: Math.max(0, Number(team.id) || 0), name: String(team.name).slice(0, 100), provider: String(team.provider || _footballTrackerCompetition(widget).provider) });
  }
  if (typeof saveState === 'function') saveState();
  if (!wasFavourite) void _footballTrackerEnsureFavouriteMatches(widget);
  _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane');
  return !wasFavourite;
}

function _footballTrackerFavouriteButton(widget, team) {
  const favourite = _footballTrackerFavourite(widget, team); const button = document.createElement('button');
  button.type = 'button'; button.className = `football-tracker-favourite${favourite ? ' is-favourite' : ''}`;
  button.textContent = favourite ? '★' : '☆'; button.title = favourite ? `Remove ${team.name} from favourite teams` : `Add ${team.name} to favourite teams`;
  button.setAttribute('aria-label', button.title); button.setAttribute('aria-pressed', String(favourite));
  button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); _footballTrackerToggleFavourite(widget, team); });
  return button;
}

function _footballTrackerCacheKey(competition, kind) {
  const season = !['EC', 'WC'].includes(competition?.code) ? `:season:${_footballTrackerSeasonYear()}` : '';
  const feedRevision = kind === 'matches' && competition?.theSportsDbFallback ? ':coverage:4' : '';
  return `${competition.provider}:${competition.code}:${kind}${season}${feedRevision}:team-identity:6`;
}
function _footballTrackerCached(widget, kind) { const competition = _footballTrackerCompetition(widget); return WidgetSDK.cache.get('footballTracker', widget.id, _footballTrackerCacheKey(competition, kind)); }
function _footballTrackerWriteCache(widget, kind, value) { const competition = _footballTrackerCompetition(widget); try { WidgetSDK.cache.set('footballTracker', widget.id, _footballTrackerCacheKey(competition, kind), value, { ttlMs: _footballTrackerMsUntilDateChange() }); } catch {} }

function _footballTrackerEnsureFavouriteMatches(widget) {
  const config = _footballTrackerConfig(widget); const runtime = _footballTrackerState(widget); const competition = _footballTrackerCompetition(widget);
  if (!config.favouriteTeams.length || (!_footballTrackerProviderToken(competition) && !competition.theSportsDbFallback) || runtime.data.matches || _footballTrackerCached(widget, 'matches') || runtime.loading.matches || runtime.errors.matches) return Promise.resolve();
  return _footballTrackerLoad(widget, 'matches').catch(() => {});
}

function _footballTrackerRefreshForDate(widget, now = Date.now()) {
  const runtime = _footballTrackerState(widget); const dateKey = _footballTrackerLocalDateKey(now);
  if (runtime.dateKey === dateKey) return false;
  runtime.dateKey = dateKey; runtime.roundKey = ''; runtime.data = {}; runtime.errors = {}; runtime.warnings = {}; _footballTrackerWriteView(widget, runtime);
  runtime.providers = {};
  for (const key of _footballTrackerSharedLoads.keys()) if (!key.startsWith(`${dateKey}:`)) _footballTrackerSharedLoads.delete(key);
  for (const key of _footballTrackerPublicLoads.keys()) if (!key.startsWith(`${dateKey}:`)) _footballTrackerPublicLoads.delete(key);
  const competition = _footballTrackerCompetition(widget);
  ['matches', 'standings'].forEach(kind => WidgetSDK.cache.remove('footballTracker', widget.id, _footballTrackerCacheKey(competition, kind)));
  _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane');
  return true;
}

function _footballTrackerProvider(competition) { return FOOTBALL_TRACKER_PROVIDERS[competition?.provider] || FOOTBALL_TRACKER_PROVIDERS.footballData; }
function _footballTrackerProviderToken(competition) { const provider = _footballTrackerProvider(competition); return typeof getServiceSecret === 'function' ? getServiceSecret(provider.secret) : ''; }

function _footballTrackerProviderPayloadError(providerId, payload) {
  if (providerId !== 'apiFootball' || !payload?.errors) return '';
  const values = Array.isArray(payload.errors) ? payload.errors : Object.values(payload.errors);
  return values.flatMap(value => Array.isArray(value) ? value : [value]).map(String).filter(Boolean).join(' ') || '';
}

function _footballTrackerProviderError(competition, directError, relayError) {
  const provider = _footballTrackerProvider(competition); const relayMessage = String(relayError?.message || relayError || '');
  if (competition.provider === 'sportmonks' && /\b401\b|invalid token|no token provided/i.test(relayMessage)) {
    return new Error('Sportmonks rejected the token. Reload Firefox extension 1.0.40, then verify the Sportmonks token in Settings > API Keys.');
  }
  if (competition.provider === 'sportmonks' && !relayMessage && /network|failed to fetch/i.test(String(directError?.message || directError || ''))) {
    return new Error('Sportmonks requires the Firefox extension relay. Reload extension 1.0.40 and refresh the Hub.');
  }
  return relayError || directError || new Error(`${provider.name} request failed.`);
}

async function _footballTrackerProviderRequest(widget, competition, path) {
  const provider = _footballTrackerProvider(competition); const token = _footballTrackerProviderToken(competition);
  if (!token) throw new Error(`Add a ${provider.name} credential in Settings > API Keys.`);
  const bases = { footballData: 'https://api.football-data.org/v4/', sportmonks: 'https://api.sportmonks.com/v3/football/', apiFootball: 'https://v3.football.api-sports.io/' };
  const headers = { Accept: 'application/json' };
  if (competition.provider === 'sportmonks') headers.Authorization = token;
  else if (competition.provider === 'apiFootball') headers['x-apisports-key'] = token;
  else headers['X-Auth-Token'] = token;
  const url = `${bases[competition.provider] || bases.footballData}${path}`;
  let directError = null;
  try {
    const response = await _fetchWithTimeout(url, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', headers, widgetType: 'footballTracker',
      widgetFetchKey: `football-tracker:${widget.id}:${competition.provider}:${path}`, maxResponseBytes: 4 * 1024 * 1024
    }, 20000);
    if (!response.ok) {
      let detail = ''; try { const payload = await response.json(); detail = String(payload?.message || payload?.error || ''); } catch {}
      throw new Error(detail || `${provider.name} returned ${response.status}`);
    }
    const payload = await response.json(); const payloadError = _footballTrackerProviderPayloadError(competition.provider, payload);
    if (payloadError) throw new Error(payloadError);
    return payload;
  } catch (error) { directError = error; }
  let relayError = null;
  try {
    const relayed = await WidgetSDK.extensionRelay.invoke('footballTracker', 'fetchCalendar', url, headers);
    if (relayed?.text) {
      const payload = JSON.parse(relayed.text); const payloadError = _footballTrackerProviderPayloadError(competition.provider, payload);
      if (payloadError) throw new Error(payloadError);
      return payload;
    }
    if (relayed?.error) relayError = new Error(relayed.error);
  } catch (error) { relayError = error; }
  throw _footballTrackerProviderError(competition, directError, relayError);
}

async function _footballTrackerSportmonksPagedRequest(widget, competition, path, maxPages = 12) {
  const rows = []; let page = 1; let payload = null; let hasMore = false;
  do {
    const separator = path.includes('?') ? '&' : '?';
    payload = await _footballTrackerProviderRequest(widget, competition, `${path}${separator}per_page=50&page=${page}`);
    const entries = Array.isArray(payload?.data) ? payload.data : [];
    rows.push(...entries);
    const pagination = payload?.pagination || payload?.meta?.pagination || {};
    hasMore = pagination.has_more === true || (Number(pagination.current_page) > 0 && Number(pagination.current_page) < Number(pagination.last_page));
    page += 1;
  } while (hasMore && page <= maxPages && rows.length < FOOTBALL_TRACKER_MAX_MATCHES);
  if (hasMore) throw new Error(`Sportmonks returned more than ${Math.min(FOOTBALL_TRACKER_MAX_MATCHES, maxPages * 50)} team fixtures; refusing to present truncated history.`);
  return { ...(payload || {}), data: rows.slice(0, FOOTBALL_TRACKER_MAX_MATCHES) };
}

async function _footballTrackerPublicJsonRequestUncached(widget, url, fetchKey) {
  const headers = { Accept: 'application/json' }; let directError = null;
  try {
    const response = await _fetchWithTimeout(url, {
      method: 'GET', credentials: 'omit', redirect: 'follow', cache: 'no-store', headers, widgetType: 'footballTracker',
      widgetFetchKey: `football-tracker:${widget.id}:public:${fetchKey}`, maxResponseBytes: 1024 * 1024
    }, 20000);
    if (!response.ok) throw new Error(`TheSportsDB returned ${response.status}`);
    return await response.json();
  } catch (error) { directError = error; }
  try {
    const relayed = await WidgetSDK.extensionRelay.invoke('footballTracker', 'fetchCalendar', url, headers);
    if (relayed?.text) return JSON.parse(relayed.text);
    if (relayed?.error) throw new Error(relayed.error);
  } catch (relayError) { throw relayError || directError; }
  throw directError || new Error('TheSportsDB request failed.');
}

function _footballTrackerPublicJsonRequest(widget, url, fetchKey, force = false) {
  const key = `${_footballTrackerLocalDateKey()}:${url}`;
  if (!force && _footballTrackerPublicLoads.has(key)) return _footballTrackerPublicLoads.get(key);
  const load = (async () => {
    try { return await _footballTrackerPublicJsonRequestUncached(widget, url, fetchKey); }
    finally { if (_footballTrackerPublicLoads.get(key) === load) _footballTrackerPublicLoads.delete(key); }
  })();
  _footballTrackerPublicLoads.set(key, load);
  return load;
}

function _footballTrackerProviderMetaCacheKey(competition, seasonYear = _footballTrackerSeasonYear()) { return `provider-meta:v3:${competition.provider}:${competition.code}:season:${seasonYear}`; }

async function _footballTrackerProviderMeta(widget, competition, force = false) {
  const seasonYear = _footballTrackerSeasonYear(); const cacheKey = _footballTrackerProviderMetaCacheKey(competition, seasonYear);
  const cached = force ? null : WidgetSDK.cache.get('footballTracker', widget.id, cacheKey);
  if (cached?.leagueId && (cached?.season || cached?.seasonId)) return cached;
  let meta;
  if (competition.provider === 'sportmonks') {
    const payload = await _footballTrackerProviderRequest(widget, competition, `leagues/${competition.leagueId}?include=currentSeason`);
    const league = payload?.data || {}; const season = league.current_season || league.currentSeason || league.currentseason;
    if (!season?.id) throw new Error(`Sportmonks did not return the current season for ${competition.name}.`);
    meta = { leagueId: Number(competition.leagueId), seasonId: Number(season.id) };
  } else if (competition.provider === 'apiFootball') {
    const payload = await _footballTrackerProviderRequest(widget, competition, `leagues?search=${encodeURIComponent(competition.apiSearch)}`);
    const entries = Array.isArray(payload?.response) ? payload.response : [];
    const wantedName = _footballTrackerPlainName(competition.apiSearch); const rankedCountry = _footballTrackerComparableArea(competition.apiCountry || competition.area); const wantedCountry = _footballTrackerDomesticArea(competition.apiCountry || competition.area);
    const entry = entries.map((candidate, index) => {
      const name = _footballTrackerPlainName(candidate?.league?.name); const country = _footballTrackerComparableArea(candidate?.country?.name);
      let score = Math.max(0, 20 - index);
      if (name === wantedName) score += 100;
      else if (name && (name.includes(wantedName) || wantedName.includes(name))) score += 40;
      if (rankedCountry && country === rankedCountry) score += 80;
      if ((candidate?.seasons || []).some(season => season?.current)) score += 20;
      return { candidate, country, score };
    }).filter(candidate => !wantedCountry || candidate.country === wantedCountry).sort((left, right) => right.score - left.score)[0]?.candidate;
    const seasons = entry?.seasons || [];
    const season = seasons.find(item => Number(item?.year) === seasonYear) || seasons.find(item => item?.current);
    if (!entry?.league?.id || !Number.isFinite(Number(season?.year))) throw new Error(`API-Football did not find the current ${competition.name} season.`);
    meta = { leagueId: Number(entry.league.id), season: Number(season.year) };
  } else return {};
  try { WidgetSDK.cache.set('footballTracker', widget.id, cacheKey, meta, { ttlMs: FOOTBALL_TRACKER_PROVIDER_META_TTL_MS }); } catch {}
  return meta;
}

function _footballTrackerTeamLinkCacheKey(team) {
  return `team-link:apiFootball:v4:${team.provider}:${team.id}:${_footballTrackerPlainName(team.lookupName || team.name)}`;
}

async function _footballTrackerResolveApiFootballTeam(widget, team, force = false) {
  if (team.provider === 'apiFootball') return _footballTrackerTeam(team);
  const cacheKey = _footballTrackerTeamLinkCacheKey(team);
  const cached = force ? null : WidgetSDK.cache.get('footballTracker', widget.id, cacheKey);
  if (cached?.id) return cached;
  const query = String(team.lookupName || team.name || '').trim();
  if (query.length < 3) throw new Error(`API-Football could not resolve ${query || 'this team'}.`);
  const apiCompetition = { provider: 'apiFootball', name: 'team history' };
  const payload = await _footballTrackerProviderRequest(widget, apiCompetition, `teams?search=${encodeURIComponent(query)}`);
  const entries = Array.isArray(payload?.response) ? payload.response : [];
  const wantedName = _footballTrackerComparableTeamName(query); const wantedArea = _footballTrackerDomesticArea(team.area);
  const ranked = entries.map((entry, index) => {
    const candidate = entry?.team || {}; const candidateName = _footballTrackerComparableTeamName(candidate.name); const candidateArea = _footballTrackerComparableArea(candidate.country);
    let score = Math.max(0, 20 - index);
    const nameMatches = candidateName === wantedName || (!!candidateName && !!wantedName && (candidateName.includes(wantedName) || wantedName.includes(candidateName)));
    if (candidateName === wantedName) score += 100;
    else if (nameMatches) score += 50;
    if (wantedArea && candidateArea === wantedArea) score += 80;
    const teamTypeMatches = _footballTrackerCompatibleTeamType(query, candidate.name);
    return { candidate, candidateArea, nameMatches, teamTypeMatches, score };
  }).filter(entry => Number(entry.candidate?.id) && entry.nameMatches && entry.teamTypeMatches && (!wantedArea || entry.candidateArea === wantedArea))
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) throw new Error(`API-Football could not find ${team.name}.`);
  const resolved = _footballTrackerTeam({ id: ranked[0].candidate.id, name: ranked[0].candidate.name, crest: ranked[0].candidate.logo, provider: 'apiFootball' });
  try { WidgetSDK.cache.set('footballTracker', widget.id, cacheKey, resolved, { ttlMs: FOOTBALL_TRACKER_TEAM_LINK_TTL_MS }); } catch {}
  return resolved;
}

function _footballTrackerTheSportsDbTeamLinkCacheKey(team, seasonYear = _footballTrackerSeasonYear()) {
  return `team-link:theSportsDb:v5:${team.provider}:${team.id}:season:${seasonYear}:${_footballTrackerPlainName(team.lookupName || team.name)}`;
}

function _footballTrackerTheSportsDbLeagueIds(team) {
  const ids = Array.isArray(team?.leagueIds) ? team.leagueIds : [];
  return [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 12);
}

function _footballTrackerTheSportsDbCandidateLeagueIds(candidate) {
  const ids = [];
  for (let index = 1; index <= 7; index += 1) {
    const suffix = index === 1 ? '' : String(index); const id = Number(candidate?.[`idLeague${suffix}`]);
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return _footballTrackerTheSportsDbLeagueIds({ leagueIds: ids });
}

function _footballTrackerTheSportsDbUefaLeagueIds(team) {
  const supported = new Set(FOOTBALL_TRACKER_COMPETITIONS.filter(competition => competition.area === 'Europe').map(competition => Number(competition.theSportsDbLeagueId)).filter(Boolean));
  return _footballTrackerTheSportsDbLeagueIds(team).filter(id => supported.has(id));
}

function _footballTrackerTheSportsDbDomesticCupCompetitions(team) {
  const associations = new Set(_footballTrackerTheSportsDbLeagueIds(team));
  return FOOTBALL_TRACKER_COMPETITIONS.filter(competition => competition.kind === 'cup' && competition.area !== 'Europe' && associations.has(Number(competition.theSportsDbLeagueId)));
}

async function _footballTrackerResolveTheSportsDbTeam(widget, team, seasonYear = _footballTrackerSeasonYear(), force = false) {
  if (team.provider === 'theSportsDb' && _footballTrackerTheSportsDbLeagueIds(team).length) return { ..._footballTrackerTeam(team), leagueIds: _footballTrackerTheSportsDbLeagueIds(team), apiFootballId: Number(team.apiFootballId) || 0 };
  const cacheKey = _footballTrackerTheSportsDbTeamLinkCacheKey(team, seasonYear);
  const cached = force ? null : WidgetSDK.cache.get('footballTracker', widget.id, cacheKey);
  if (cached?.id) return cached;
  const query = String(team.lookupName || team.name || '').trim();
  if (query.length < 3) throw new Error(`TheSportsDB could not resolve ${query || 'this team'}.`);
  const url = `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(query)}`;
  const payload = await _footballTrackerPublicJsonRequest(widget, url, `theSportsDb:team:${_footballTrackerPlainName(query)}`, force);
  const wantedName = _footballTrackerComparableTeamName(query); const wantedArea = _footballTrackerDomesticArea(team.area);
  const expectedLeagueId = Number(_footballTrackerCompetition(team.competitionCode)?.theSportsDbLeagueId) || 0;
  const ranked = (Array.isArray(payload?.teams) ? payload.teams : []).map((candidate, index) => {
    const candidateName = _footballTrackerComparableTeamName(candidate?.strTeam); const candidateArea = _footballTrackerComparableArea(candidate?.strCountry);
    const candidateLeagueIds = _footballTrackerTheSportsDbCandidateLeagueIds(candidate);
    let score = Math.max(0, 20 - index);
    const nameMatches = candidateName === wantedName || (!!candidateName && !!wantedName && (candidateName.includes(wantedName) || wantedName.includes(candidateName)));
    if (candidateName === wantedName) score += 100;
    else if (nameMatches) score += 50;
    if (wantedArea && candidateArea === wantedArea) score += 80;
    if (expectedLeagueId && candidateLeagueIds.includes(expectedLeagueId)) score += 160;
    const leagueMatches = !expectedLeagueId || !candidateLeagueIds.length || candidateLeagueIds.includes(expectedLeagueId);
    const teamTypeMatches = _footballTrackerCompatibleTeamType(query, candidate?.strTeam);
    return { candidate, candidateArea, leagueMatches, nameMatches, teamTypeMatches, score };
  }).filter(entry => Number(entry.candidate?.idTeam) && entry.nameMatches && entry.teamTypeMatches && entry.leagueMatches && (!wantedArea || entry.candidateArea === wantedArea))
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) throw new Error(`TheSportsDB could not find ${team.name}.`);
  const candidate = ranked[0].candidate;
  const resolved = {
    ..._footballTrackerTeam({ id: candidate.idTeam, name: candidate.strTeam, crest: candidate.strBadge, provider: 'theSportsDb' }),
    leagueIds: _footballTrackerTheSportsDbCandidateLeagueIds(candidate), apiFootballId: Number(candidate.idAPIfootball) || 0
  };
  try { WidgetSDK.cache.set('footballTracker', widget.id, cacheKey, resolved, { ttlMs: FOOTBALL_TRACKER_TEAM_LINK_TTL_MS }); } catch {}
  return resolved;
}

async function _footballTrackerTheSportsDbRecentMatches(widget, team, seasonYear, force = false) {
  const resolved = await _footballTrackerResolveTheSportsDbTeam(widget, team, seasonYear, force);
  const season = `${seasonYear}-${seasonYear + 1}`; const cacheKey = `theSportsDb:team:${resolved.id}:completed:season:${seasonYear}:v5`;
  const accumulated = WidgetSDK.cache.get('footballTracker', widget.id, cacheKey) || [];
  const requests = [['last', `eventslast.php?id=${encodeURIComponent(resolved.id)}`], ['next', `eventsnext.php?id=${encodeURIComponent(resolved.id)}`]];
  if (_footballTrackerTheSportsDbUefaLeagueIds(resolved).length) requests.push(['team-season', `searchevents.php?e=${encodeURIComponent(resolved.name)}&s=${encodeURIComponent(season)}`]);
  const settled = await Promise.allSettled(requests.map(([label, path]) => {
    const url = `https://www.thesportsdb.com/api/v1/json/123/${path}`;
    return _footballTrackerPublicJsonRequest(widget, url, `theSportsDb:${label}:${resolved.id}:${season}`, force);
  }));
  if (!settled.some(result => result.status === 'fulfilled')) throw settled.find(result => result.status === 'rejected')?.reason || new Error('TheSportsDB team schedule failed.');
  const payloadMatches = settled.flatMap(result => {
    if (result.status !== 'fulfilled') return [];
    const entries = result.value?.results || result.value?.events || result.value?.event;
    return _footballTrackerTheSportsDbMatches({ events: (Array.isArray(entries) ? entries : []).filter(item => !item?.strSeason || item.strSeason === season) });
  });
  const domesticCupLoads = await Promise.allSettled(_footballTrackerTheSportsDbDomesticCupCompetitions(resolved)
    .map(competition => _footballTrackerTheSportsDbCompetitionMatches(widget, competition, seasonYear, 2, force)));
  domesticCupLoads.forEach(result => { if (result.status === 'fulfilled') payloadMatches.push(...result.value); });
  const reverseLegSeeds = payloadMatches.filter(match => {
    const canonical = _footballTrackerCanonicalCompetition(match.competition);
    return ['FINISHED', 'AWARDED'].includes(match.status)
      && canonical.area === 'Europe'
      && _footballTrackerHistoryTeamSide(match, team, { theSportsDb: resolved.id }) === 'home';
  }).slice(-4);
  const reverseLegs = await Promise.allSettled(reverseLegSeeds.map(match => {
    const title = `${match.away.name}_vs_${match.home.name}`;
    const url = `https://www.thesportsdb.com/api/v1/json/123/searchevents.php?e=${encodeURIComponent(title)}&s=${encodeURIComponent(season)}`;
    return _footballTrackerPublicJsonRequest(widget, url, `theSportsDb:reverse-leg:${resolved.id}:${_footballTrackerPlainName(match.away.name)}:${season}`, force);
  }));
  reverseLegs.forEach(result => {
    if (result.status !== 'fulfilled') return;
    const entries = result.value?.results || result.value?.events || result.value?.event;
    payloadMatches.push(..._footballTrackerTheSportsDbMatches({ events: (Array.isArray(entries) ? entries : []).filter(item => !item?.strSeason || item.strSeason === season) }));
  });
  const completed = new Map();
  [...accumulated, ...payloadMatches.filter(match => ['FINISHED', 'AWARDED'].includes(match.status))]
    .forEach(match => completed.set(`${match?.competition?.provider || ''}:${match?.id || 0}:${match?.utcDate || 0}`, match));
  const completedMatches = [...completed.values()].sort((left, right) => left.utcDate - right.utcDate).slice(-100);
  const upcomingByFixture = new Map();
  payloadMatches.filter(match => ['SCHEDULED', 'POSTPONED'].includes(match.status))
    .forEach(match => upcomingByFixture.set(`${match?.competition?.provider || ''}:${match?.id || 0}:${match?.utcDate || 0}`, match));
  const upcoming = [...upcomingByFixture.values()].sort((left, right) => left.utcDate - right.utcDate).slice(0, 100);
  try { WidgetSDK.cache.set('footballTracker', widget.id, cacheKey, completedMatches, { ttlMs: FOOTBALL_TRACKER_TEAM_LINK_TTL_MS }); } catch {}
  return { resolved, matches: _footballTrackerMatchesForTeam([...completedMatches, ...upcoming], resolved, resolved.id) };
}

async function _footballTrackerProviderTeamMatches(widget, team, seasonYear) {
  const competition = { ..._footballTrackerCompetition(team.competitionCode), provider: team.provider };
  let payload;
  if (team.provider === 'sportmonks') {
    const range = _footballTrackerSeasonDateRange(seasonYear);
    payload = await _footballTrackerSportmonksPagedRequest(widget, competition, `fixtures/between/${range.start}/${range.end}/${team.id}?include=participants;scores;state;league;stage;round;group`);
  }
  else if (team.provider === 'apiFootball') payload = await _footballTrackerProviderRequest(widget, competition, `fixtures?team=${team.id}&season=${seasonYear}`);
  else payload = await _footballTrackerProviderRequest(widget, competition, `teams/${team.id}/matches?season=${seasonYear}&limit=500`);
  return _footballTrackerNormalize(payload, team.provider, 'matches');
}

function _footballTrackerMatchesForTeam(matches, team, providerTeamId = 0) {
  const id = Number(providerTeamId) || 0;
  const wanted = _footballTrackerComparableTeamName(team?.name);
  return (Array.isArray(matches) ? matches : []).filter(match => (id && [match?.home?.id, match?.away?.id].includes(id))
    || (wanted && [match?.home?.name, match?.away?.name].some(name => _footballTrackerComparableTeamName(name) === wanted)));
}

async function _footballTrackerFootballDataChampionsLeagueMatches(widget, team, seasonYear, force = false) {
  const competition = _footballTrackerCompetition('CL'); const cacheKey = `${competition.provider}:${competition.code}:matches:season:${seasonYear}:feed:2`;
  let matches = force ? null : WidgetSDK.cache.get('footballTracker', widget.id, cacheKey);
  if (!matches) {
    const sharedKey = `${_footballTrackerLocalDateKey()}:${cacheKey}`;
    let sharedLoad = force ? null : _footballTrackerSharedLoads.get(sharedKey);
    if (!sharedLoad) {
      const path = `competitions/${encodeURIComponent(competition.code)}/matches?season=${encodeURIComponent(seasonYear)}`;
      sharedLoad = _footballTrackerProviderRequest(widget, competition, path).then(payload => _footballTrackerNormalize(payload, competition.provider, 'matches'));
      _footballTrackerSharedLoads.set(sharedKey, sharedLoad);
    }
    try { matches = await sharedLoad; }
    catch (error) { if (_footballTrackerSharedLoads.get(sharedKey) === sharedLoad) _footballTrackerSharedLoads.delete(sharedKey); throw error; }
    try { WidgetSDK.cache.set('footballTracker', widget.id, cacheKey, matches, { ttlMs: _footballTrackerMsUntilDateChange() }); } catch {}
  }
  return _footballTrackerMatchesForTeam(matches, team);
}

function _footballTrackerTeamHistoryCoverage(team) {
  const providers = [team.provider, 'theSportsDb'];
  if (team.provider !== 'footballData' && _footballTrackerProviderToken({ provider: 'footballData' })) providers.push('footballData');
  if (team.provider !== 'apiFootball' && _footballTrackerProviderToken({ provider: 'apiFootball' })) providers.push('apiFootball');
  return [...new Set(providers)].sort().join('+');
}

function _footballTrackerTeamHistoryCacheKey(team, coverage = _footballTrackerTeamHistoryCoverage(team), seasonYear = _footballTrackerSeasonYear()) {
  return `team-history:v13:${team.provider}:${team.id}:${seasonYear}:${coverage}`;
}

async function _footballTrackerFetchTeamHistory(widget, team, force = false) {
  const seasonYear = _footballTrackerSeasonYear(); const providerTeamIds = { [team.provider]: team.id };
  const requests = [];
  if (team.provider !== 'theSportsDb') requests.push({ provider: team.provider, primary: true, promise: _footballTrackerProviderTeamMatches(widget, team, seasonYear).then(matches => ({ matches, found: matches.length > 0 })) });
  const footballDataToken = _footballTrackerProviderToken({ provider: 'footballData' });
  if (team.provider !== 'footballData' && footballDataToken) {
    requests.push({
      provider: 'footballData',
      promise: _footballTrackerFootballDataChampionsLeagueMatches(widget, team, seasonYear, force).then(matches => ({ matches, found: matches.length > 0 }))
    });
  }
  const apiToken = _footballTrackerProviderToken({ provider: 'apiFootball' });
  if (team.provider !== 'apiFootball' && apiToken) {
    requests.push({
      provider: 'apiFootball',
      promise: _footballTrackerResolveApiFootballTeam(widget, team, force).then(resolved => {
        providerTeamIds.apiFootball = resolved.id;
        return _footballTrackerProviderTeamMatches(widget, { ...resolved, provider: 'apiFootball', competitionCode: team.competitionCode }, seasonYear);
      }).then(matches => ({ matches, found: true }))
    });
  }
  requests.push({
    provider: 'theSportsDb',
    promise: _footballTrackerTheSportsDbRecentMatches(widget, team, seasonYear, force).then(result => {
      providerTeamIds.theSportsDb = result.resolved.id;
      if (!providerTeamIds.apiFootball && result.resolved.apiFootballId) providerTeamIds.apiFootball = result.resolved.apiFootballId;
      return { matches: result.matches, found: result.matches.length > 0 };
    })
  });
  const settled = await Promise.allSettled(requests.map(request => request.promise)); const matches = []; let found = false; let fulfilled = false; let primaryFulfilled = false;
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      fulfilled = true; primaryFulfilled ||= !!requests[index]?.primary; matches.push(...result.value.matches); found ||= result.value.found;
    }
  });
  if (!fulfilled || (!found && !primaryFulfilled && settled.some(result => result.status === 'rejected'))) throw new Error(`${team.name}'s current-season match history could not be retrieved from any available provider.`);
  const history = _footballTrackerBuildTeamHistory(matches, team, providerTeamIds, team.competitionCode);
  if (!primaryFulfilled && settled.some(result => result.status === 'rejected')) history.warnings = ['Some provider coverage could not be loaded; the displayed history may be incomplete.'];
  return history;
}

function _footballTrackerLoadTeamHistory(widget, team, force = false) {
  const runtime = _footballTrackerState(widget); const coverage = _footballTrackerTeamHistoryCoverage(team);
  const cacheKey = _footballTrackerTeamHistoryCacheKey(team, coverage);
  if (runtime.loading.teamHistory?.key === cacheKey) return runtime.loading.teamHistory.promise;
  if (!force) {
    const cached = WidgetSDK.cache.get('footballTracker', widget.id, cacheKey);
    if (cached) { runtime.data.teamHistory = { cacheKey, value: cached }; return Promise.resolve(cached); }
  }
  runtime.errors.teamHistory = '';
  const promise = _footballTrackerFetchTeamHistory(widget, team, force).then(history => {
    try { WidgetSDK.cache.set('footballTracker', widget.id, cacheKey, history, { ttlMs: _footballTrackerMsUntilDateChange() }); } catch {}
    if (runtime.selectedTeam && _footballTrackerTeamHistoryCacheKey(runtime.selectedTeam, coverage) === cacheKey) runtime.data.teamHistory = { cacheKey, value: history };
    return history;
  }).catch(error => {
    if (runtime.selectedTeam && _footballTrackerTeamHistoryCacheKey(runtime.selectedTeam, coverage) === cacheKey) runtime.errors.teamHistory = error?.message || 'Team history could not be loaded.';
    throw error;
  }).finally(() => {
    if (runtime.loading.teamHistory?.key === cacheKey) runtime.loading.teamHistory = null;
    _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane');
  });
  runtime.loading.teamHistory = { key: cacheKey, promise };
  return promise;
}

async function _footballTrackerCompetitionPayload(widget, competition, kind, force = false) {
  if (competition.provider === 'sportmonks') {
    const meta = await _footballTrackerProviderMeta(widget, competition, force);
    const path = kind === 'matches'
      ? `schedules/seasons/${meta.seasonId}`
      : `standings/seasons/${meta.seasonId}?include=participant;details;stage;group`;
    return _footballTrackerProviderRequest(widget, competition, path);
  }
  if (competition.provider === 'apiFootball') {
    const meta = await _footballTrackerProviderMeta(widget, competition, force);
    return _footballTrackerProviderRequest(widget, competition, `${kind === 'matches' ? 'fixtures' : 'standings'}?league=${meta.leagueId}&season=${meta.season}`);
  }
  const season = FOOTBALL_TRACKER_FOOTBALL_DATA_SEASONAL_CODES.has(competition.code) ? `?season=${encodeURIComponent(_footballTrackerSeasonYear())}` : '';
  return _footballTrackerProviderRequest(widget, competition, `competitions/${encodeURIComponent(competition.code)}/${kind === 'matches' ? 'matches' : 'standings'}${season}`);
}

async function _footballTrackerTheSportsDbCompetitionMatches(widget, competition, seasonYear = _footballTrackerSeasonYear(), nextWindowDays = 0, force = false) {
  const leagueId = Number(competition?.theSportsDbLeagueId); const season = `${seasonYear}-${seasonYear + 1}`;
  if (!leagueId) throw new Error(`TheSportsDB does not have a configured fallback for ${competition?.name || 'this competition'}.`);
  const endpoints = [
    ['past', `eventspastleague.php?id=${leagueId}`],
    ['next', `eventsnextleague.php?id=${leagueId}`],
    ['season', `eventsseason.php?id=${leagueId}&s=${encodeURIComponent(season)}`]
  ];
  const settled = await Promise.allSettled(endpoints.map(([label, path]) => {
    const url = `https://www.thesportsdb.com/api/v1/json/123/${path}`;
    return _footballTrackerPublicJsonRequest(widget, url, `theSportsDb:${competition.code}:${label}:${season}`, force);
  }));
  const seedEntries = settled.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value?.events) ? result.value.events : [])
    .filter(item => !item?.strSeason || item.strSeason === season);
  if (!settled.some(result => result.status === 'fulfilled')) throw settled.find(result => result.status === 'rejected')?.reason || new Error(`${competition.name} fallback failed.`);
  const dates = new Set(seedEntries.map(item => String(item?.dateEvent || '').slice(0, 10)).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  const nextEntries = settled[1]?.status === 'fulfilled' && Array.isArray(settled[1].value?.events) ? settled[1].value.events : [];
  nextEntries.filter(item => !item?.strSeason || item.strSeason === season).forEach(item => {
    const timestamp = Date.parse(`${String(item?.dateEvent || '').slice(0, 10)}T12:00:00Z`);
    if (!Number.isFinite(timestamp)) return;
    for (let offset = 1; offset <= Math.min(3, Math.max(0, Number(nextWindowDays) || 0)); offset += 1) dates.add(new Date(timestamp + offset * 86400000).toISOString().slice(0, 10));
  });
  const dayLoads = await Promise.allSettled([...dates].map(date => {
    const url = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${encodeURIComponent(date)}&l=${leagueId}`;
    return _footballTrackerPublicJsonRequest(widget, url, `theSportsDb:${competition.code}:day:${date}`, force);
  }));
  const dayEntries = dayLoads.flatMap(result => result.status === 'fulfilled' && Array.isArray(result.value?.events) ? result.value.events : [])
    .filter(item => !item?.strSeason || item.strSeason === season);
  const deduplicated = new Map();
  _footballTrackerTheSportsDbMatches({ events: [...seedEntries, ...dayEntries] }).forEach(match => deduplicated.set(`${match.id}:${match.utcDate}`, match));
  return [...deduplicated.values()].sort((left, right) => left.utcDate - right.utcDate);
}

function _footballTrackerMergeMatchCoverage(...feeds) {
  const merged = [];
  feeds.flat().filter(Boolean).forEach(match => {
    if (!merged.some(existing => _footballTrackerEquivalentFixtures(existing, match))) merged.push(match);
  });
  return merged.sort((left, right) => left.utcDate - right.utcDate).slice(0, FOOTBALL_TRACKER_MAX_MATCHES);
}

async function _footballTrackerCompetitionData(widget, competition, kind, force = false) {
  if (kind === 'matches' && competition.theSportsDbFallback) {
    const [primary, supplemental] = await Promise.allSettled([
      _footballTrackerCompetitionPayload(widget, competition, kind, force).then(payload => _footballTrackerNormalize(payload, competition.provider, kind)),
      _footballTrackerTheSportsDbCompetitionMatches(widget, competition, _footballTrackerSeasonYear(), competition.kind === 'cup' ? 2 : 0, force)
    ]);
    if (primary.status === 'rejected' && supplemental.status === 'rejected') throw primary.reason;
    const primaryMatches = primary.status === 'fulfilled' ? primary.value : [];
    const supplementalMatches = supplemental.status === 'fulfilled' ? supplemental.value : [];
    if (primary.status === 'rejected' && !supplementalMatches.length) throw primary.reason;
    const warning = primary.status === 'rejected'
      ? `${_footballTrackerProvider(competition).name} is unavailable. Showing partial TheSportsDB fallback coverage.`
      : (supplemental.status === 'rejected' ? 'Supplemental TheSportsDB coverage is unavailable; some cup or qualifying fixtures may be missing.' : '');
    return { value: _footballTrackerMergeMatchCoverage(primaryMatches, supplementalMatches), provider: primaryMatches.length ? competition.provider : 'theSportsDb', warning };
  }
  try {
      const payload = await _footballTrackerCompetitionPayload(widget, competition, kind, force);
    return { value: _footballTrackerNormalize(payload, competition.provider, kind), provider: competition.provider, warning: '' };
  } catch (error) {
    if (!competition.theSportsDbFallback) throw error;
    return { value: [], provider: competition.provider };
  }
}

async function _footballTrackerLoad(widget, kind, force = false) {
  const runtime = _footballTrackerState(widget); const competition = _footballTrackerCompetition(widget);
  if (runtime.loading[kind]) return runtime.loading[kind];
  if (!force) {
    const cached = _footballTrackerCached(widget, kind);
    if (cached) {
      runtime.data[kind] = cached;
      runtime.providers[kind] = cached.find?.(item => item?.competition?.provider)?.competition?.provider || competition.provider;
      const cachedProviders = [...new Set((Array.isArray(cached) ? cached : []).map(item => item?.competition?.provider).filter(Boolean))];
      runtime.warnings[kind] = kind === 'matches' && competition.theSportsDbFallback && cachedProviders.length === 1 && cachedProviders[0] === 'theSportsDb'
        ? `${_footballTrackerProvider(competition).name} was unavailable when this cache was populated. TheSportsDB fallback coverage may be partial.` : '';
      return cached;
    }
  }
  runtime.errors[kind] = '';
  runtime.warnings[kind] = '';
  runtime.loading[kind] = (async () => {
    try {
      const sharedKey = `${_footballTrackerLocalDateKey()}:${_footballTrackerCacheKey(competition, kind)}`;
      let sharedLoad = force ? null : _footballTrackerSharedLoads.get(sharedKey);
      if (!sharedLoad) {
        sharedLoad = _footballTrackerCompetitionData(widget, competition, kind, force);
        _footballTrackerSharedLoads.set(sharedKey, sharedLoad);
      }
      let result;
      try { result = await sharedLoad; }
      catch (error) { if (_footballTrackerSharedLoads.get(sharedKey) === sharedLoad) _footballTrackerSharedLoads.delete(sharedKey); throw error; }
      const normalized = result.value; runtime.providers[kind] = result.provider; runtime.warnings[kind] = result.warning || '';
      runtime.data[kind] = normalized;
      _footballTrackerWriteCache(widget, kind, normalized);
      return normalized;
    } catch (error) { runtime.errors[kind] = error?.message || 'Football data could not be loaded.'; throw error; }
    finally { runtime.loading[kind] = null; _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane'); }
  })();
  return runtime.loading[kind];
}

function _footballTrackerOpenTeamHistory(widget, team) {
  if (!team?.id) return;
  const runtime = _footballTrackerState(widget); const competition = _footballTrackerCompetition(widget);
  runtime.selectedTeam = { ..._footballTrackerTeam(team), provider: String(team.provider || competition.provider), area: competition.area, competitionCode: competition.code };
  runtime.historyTabKey = ''; runtime.errors.teamHistory = ''; delete runtime.data.teamHistory; _footballTrackerWriteView(widget, runtime);
  _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane');
}

function _footballTrackerCloseTeamHistory(widget) {
  const runtime = _footballTrackerState(widget); runtime.selectedTeam = null; runtime.historyTabKey = ''; runtime.errors.teamHistory = ''; delete runtime.data.teamHistory; _footballTrackerWriteView(widget, runtime);
  _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane');
}

function _footballTrackerTeamNode(widget, team, interactive = true) {
  const canOpen = interactive && !!team?.id; const node = document.createElement(canOpen ? 'button' : 'span');
  node.className = `football-tracker-team${canOpen ? ' is-interactive' : ''}${_footballTrackerFavourite(widget, team) ? ' is-favourite' : ''}`;
  if (canOpen) { node.type = 'button'; node.title = `View ${team.name} current-season match history`; node.setAttribute('aria-label', node.title); node.addEventListener('click', () => _footballTrackerOpenTeamHistory(widget, team)); }
  if (widget.config.showCrests && team.crest) { const image = document.createElement('img'); image.src = team.crest; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.draggable = false; node.appendChild(image); }
  const name = document.createElement('span'); name.textContent = team.name; node.appendChild(name); return node;
}

function _footballTrackerScore(match) {
  if (match.homeScore !== null && match.awayScore !== null) return `${match.homeScore} – ${match.awayScore}`;
  if (match.status === 'POSTPONED') return 'TBC';
  if (match.status === 'CANCELLED') return '—';
  return new Date(match.utcDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function _footballTrackerMatchStatusLabel(match) {
  if (_footballTrackerActiveStatus(match?.status)) return _footballTrackerStageLabel(match.status);
  if (match?.status === 'FINISHED') return 'Full time';
  if (match?.status === 'AWARDED') return 'Awarded';
  if (match?.status === 'POSTPONED') return 'Postponed';
  if (match?.status === 'CANCELLED') return 'Cancelled';
  return new Date(match.utcDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function _footballTrackerSortHistoryMatches(matches, direction = 'newest') {
  const order = direction === 'oldest' ? 1 : -1;
  return [...(Array.isArray(matches) ? matches : [])].sort((left, right) => {
    const timestamp = value => Number.isFinite(Number(value)) ? Number(value) : Date.parse(value);
    const leftTime = timestamp(left?.utcDate); const rightTime = timestamp(right?.utcDate);
    if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0;
    if (!Number.isFinite(rightTime)) return -1;
    return (leftTime - rightTime) * order;
  });
}

function _footballTrackerVisibleUpcoming(widget, matches, now = Date.now()) {
  const upcoming = (Array.isArray(matches) ? matches : []).filter(match => _footballTrackerActiveStatus(match?.status) || match?.status === 'POSTPONED' || Number(match?.utcDate) >= now)
    .sort((left, right) => Number(_footballTrackerActiveStatus(right?.status)) - Number(_footballTrackerActiveStatus(left?.status)) || Number(left.utcDate) - Number(right.utcDate));
  const limit = _footballTrackerConfig(widget).historyUpcomingLimit;
  return limit === 0 ? upcoming : upcoming.slice(0, limit);
}

function _footballTrackerVisibleHistoryGroups(widget, groups, now = Date.now()) {
  return (Array.isArray(groups) ? groups : []).filter(group => (group?.matches?.length || 0) > 0 || _footballTrackerVisibleUpcoming(widget, group?.upcoming, now).length > 0);
}

function _footballTrackerCoverageNote(message) {
  if (!message) return null;
  const note = document.createElement('div'); note.className = 'football-tracker-history-note is-warning'; note.textContent = message; return note;
}

function _footballTrackerRenderMatches(widget, runtime, body) {
  const matches = runtime.data.matches || _footballTrackerCached(widget, 'matches');
  if (!matches) {
    const state = document.createElement('div'); state.className = 'widget-empty-state'; state.textContent = runtime.errors.matches || 'Loading fixtures…'; body.appendChild(state);
    if (!runtime.loading.matches && !runtime.errors.matches) void _footballTrackerLoad(widget, 'matches').catch(() => {});
    return;
  }
  runtime.data.matches = matches;
  const competition = _footballTrackerCompetition(widget); const rounds = _footballTrackerRounds(matches, competition);
  if (!rounds.length) {
    const empty = document.createElement('div'); empty.className = 'widget-empty-state'; empty.textContent = 'No fixtures are available for this competition.'; body.appendChild(empty);
    const warning = _footballTrackerCoverageNote(runtime.warnings.matches); if (warning) body.appendChild(warning); return;
  }
  let selected = rounds.find(round => round.key === runtime.roundKey) || _footballTrackerDefaultRound(rounds);
  if (runtime.roundKey !== selected.key) { runtime.roundKey = selected.key; _footballTrackerWriteView(widget, runtime); }
  const index = rounds.indexOf(selected); const navigation = document.createElement('div'); navigation.className = 'football-tracker-round-nav';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '‹'; previous.title = 'Previous'; previous.disabled = index <= 0;
  const label = document.createElement('strong'); label.textContent = selected.label;
  const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.title = 'Next'; next.disabled = index >= rounds.length - 1;
  const selectRound = nextIndex => { runtime.roundKey = rounds[nextIndex].key; _footballTrackerWriteView(widget, runtime); _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane'); };
  previous.addEventListener('click', () => selectRound(index - 1)); next.addEventListener('click', () => selectRound(index + 1)); navigation.append(previous, label, next); body.appendChild(navigation);
  const list = document.createElement('div'); list.className = 'football-tracker-matches';
  selected.matches.forEach(match => {
    const row = document.createElement('div'); row.className = `football-tracker-match status-${match.status.toLowerCase().replaceAll('_', '-')}`;
    const home = _footballTrackerTeamNode(widget, match.home); const score = document.createElement('strong'); score.className = 'football-tracker-score'; score.textContent = _footballTrackerScore(match); const away = _footballTrackerTeamNode(widget, match.away);
    const meta = document.createElement('span'); meta.className = 'football-tracker-match-meta'; meta.textContent = _footballTrackerMatchStatusLabel(match);
    row.append(home, score, away, meta); list.appendChild(row);
  });
  body.appendChild(list);
  const warning = _footballTrackerCoverageNote(runtime.warnings.matches); if (warning) body.appendChild(warning);
}

function _footballTrackerRenderStandings(widget, runtime, body) {
  const standings = runtime.data.standings || _footballTrackerCached(widget, 'standings');
  if (!standings) {
    const state = document.createElement('div'); state.className = 'widget-empty-state'; state.textContent = runtime.errors.standings || 'Loading standings…'; body.appendChild(state);
    if (!runtime.loading.standings && !runtime.errors.standings) void _footballTrackerLoad(widget, 'standings').catch(() => {});
    return;
  }
  runtime.data.standings = standings;
  if (!standings.length) { const empty = document.createElement('div'); empty.className = 'widget-empty-state'; empty.textContent = 'No table is available for this competition or stage.'; body.appendChild(empty); return; }
  standings.forEach(standing => {
    if (standings.length > 1 || standing.group) { const heading = document.createElement('strong'); heading.className = 'football-tracker-table-heading'; heading.textContent = standing.group || _footballTrackerStageLabel(standing.stage); body.appendChild(heading); }
    const table = document.createElement('div'); table.className = 'football-tracker-table';
    const header = document.createElement('div'); header.className = 'football-tracker-table-row is-header'; header.innerHTML = '<span>#</span><span>Team</span><span>P</span><span>GF</span><span>GA</span><span>GD</span><span>Pts</span>'; table.appendChild(header);
    standing.table.forEach(entry => {
      const row = document.createElement('div'); row.className = `football-tracker-table-row${_footballTrackerFavourite(widget, entry.team) ? ' is-favourite' : ''}`;
      const position = document.createElement('span'); position.textContent = String(entry.position);
      const teamCell = document.createElement('div'); teamCell.className = 'football-tracker-table-team'; teamCell.append(_footballTrackerFavouriteButton(widget, entry.team), _footballTrackerTeamNode(widget, entry.team));
      const played = document.createElement('span'); played.textContent = String(entry.played); const goalsFor = document.createElement('span'); goalsFor.textContent = String(entry.goalsFor); const goalsAgainst = document.createElement('span'); goalsAgainst.textContent = String(entry.goalsAgainst); const difference = document.createElement('span'); difference.textContent = entry.goalDifference > 0 ? `+${entry.goalDifference}` : String(entry.goalDifference); const points = document.createElement('strong'); points.textContent = String(entry.points); row.append(position, teamCell, played, goalsFor, goalsAgainst, difference, points); table.appendChild(row);
    }); body.appendChild(table);
  });
}

function _footballTrackerRenderHistoryAttribution(history) {
  const attribution = document.createElement('span'); attribution.className = 'football-tracker-attribution football-tracker-history-attribution'; attribution.append('Data: ');
  const providers = history?.providers?.length ? history.providers : (history?.team?.provider ? [history.team.provider] : []);
  providers.forEach((providerId, index) => {
    const provider = FOOTBALL_TRACKER_PROVIDERS[providerId]; if (!provider) return;
    if (index) attribution.append(' · ');
    const link = document.createElement('a'); link.href = provider.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = provider.name; attribution.appendChild(link);
  });
  return attribution;
}

function _footballTrackerRenderTeamHistory(widget, runtime, element) {
  const team = runtime.selectedTeam; const coverage = _footballTrackerTeamHistoryCoverage(team);
  const cacheKey = _footballTrackerTeamHistoryCacheKey(team, coverage); let history = runtime.data.teamHistory?.cacheKey === cacheKey ? runtime.data.teamHistory.value : null;
  if (!history) {
    history = WidgetSDK.cache.get('footballTracker', widget.id, cacheKey);
    if (history) runtime.data.teamHistory = { cacheKey, value: history };
  }
  const header = document.createElement('div'); header.className = 'football-tracker-history-header';
  const back = document.createElement('button'); back.type = 'button'; back.className = 'football-tracker-history-back'; back.textContent = '‹'; back.title = 'Back to competition'; back.setAttribute('aria-label', back.title); back.addEventListener('click', () => _footballTrackerCloseTeamHistory(widget));
  const identity = document.createElement('div'); identity.className = 'football-tracker-identity'; const eyebrow = document.createElement('span'); eyebrow.textContent = 'Current season'; const title = document.createElement('strong'); title.textContent = team.name; identity.append(eyebrow, title);
  const sort = document.createElement('button'); sort.type = 'button'; sort.className = 'football-tracker-history-sort'; sort.textContent = runtime.historySort === 'oldest' ? 'Oldest first' : 'Newest first'; sort.title = runtime.historySort === 'oldest' ? 'Show newest matches first' : 'Show oldest matches first'; sort.setAttribute('aria-label', sort.title);
  sort.addEventListener('click', () => { runtime.historySort = runtime.historySort === 'oldest' ? 'newest' : 'oldest'; _footballTrackerWriteView(widget, runtime); _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane'); });
  header.append(back, identity, sort); element.appendChild(header);
  const body = document.createElement('div'); body.className = 'football-tracker-body football-tracker-history-body'; element.appendChild(body);
  if (!history) {
    const state = document.createElement('div'); state.className = runtime.errors.teamHistory ? 'football-tracker-history-note is-error' : 'widget-empty-state'; state.textContent = runtime.errors.teamHistory || 'Loading team history…'; body.appendChild(state);
    if (!runtime.loading.teamHistory && !runtime.errors.teamHistory) void _footballTrackerLoadTeamHistory(widget, team).catch(() => {});
    element.appendChild(_footballTrackerRenderHistoryAttribution({ providers: [team.provider] })); return;
  }
  const historyNow = Date.now(); const visibleGroups = _footballTrackerVisibleHistoryGroups(widget, history.groups, historyNow);
  if (!visibleGroups.length) {
    const empty = document.createElement('div'); empty.className = 'widget-empty-state'; empty.textContent = 'No current-season results or upcoming matches are available.'; body.appendChild(empty);
  } else {
    const tabs = document.createElement('div'); tabs.className = 'football-tracker-history-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', `${team.name} competitions`);
    let selected = visibleGroups.find(group => group.key === runtime.historyTabKey) || visibleGroups[0];
    if (runtime.historyTabKey !== selected.key) { runtime.historyTabKey = selected.key; _footballTrackerWriteView(widget, runtime); }
    visibleGroups.forEach(group => {
      const tab = document.createElement('button'); tab.type = 'button'; tab.classList.toggle('active', group.key === selected.key); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', group.key === selected.key ? 'true' : 'false'); tab.textContent = group.name;
      const count = document.createElement('span'); count.textContent = String(group.matches.length + _footballTrackerVisibleUpcoming(widget, group.upcoming, historyNow).length); tab.appendChild(count);
      tab.addEventListener('click', () => { runtime.historyTabKey = group.key; _footballTrackerWriteView(widget, runtime); _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane'); }); tabs.appendChild(tab);
    });
    body.appendChild(tabs);
    const upcoming = _footballTrackerVisibleUpcoming(widget, selected.upcoming, historyNow); const hasActive = upcoming.some(match => _footballTrackerActiveStatus(match.status));
    if (!selected.matches.length && !upcoming.length) {
      const empty = document.createElement('div'); empty.className = 'widget-empty-state'; empty.textContent = `No ${selected.name} matches are available yet.`; body.appendChild(empty);
    } else {
      if (selected.matches.length) {
        const heading = document.createElement('strong'); heading.className = 'football-tracker-history-section-heading'; heading.textContent = 'Results'; body.appendChild(heading);
        const list = document.createElement('div'); list.className = 'football-tracker-history-matches';
        _footballTrackerSortHistoryMatches(selected.matches, runtime.historySort).forEach(match => {
          const row = document.createElement('div'); row.className = 'football-tracker-history-match';
          const date = document.createElement('time'); date.dateTime = new Date(match.utcDate).toISOString(); date.textContent = new Date(match.utcDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          const venue = document.createElement('span'); venue.className = 'football-tracker-history-venue'; venue.textContent = match.venue; venue.title = match.venue === 'H' ? 'Home' : 'Away';
          const opponent = _footballTrackerTeamNode(widget, match.opponent, false);
          const score = document.createElement('strong'); score.className = 'football-tracker-history-score'; score.textContent = match.homeScore === null || match.awayScore === null ? '—' : `${match.homeScore}–${match.awayScore}`;
          const result = document.createElement('span'); result.className = `football-tracker-history-result result-${String(match.result || 'none').toLowerCase()}`; result.textContent = match.result || '–'; result.title = match.result === 'W' ? 'Win' : (match.result === 'L' ? 'Loss' : (match.result === 'D' ? 'Draw' : 'Result unavailable'));
          row.append(date, venue, opponent, score, result); list.appendChild(row);
        }); body.appendChild(list);
      }
      if (upcoming.length) {
        const heading = document.createElement('strong'); heading.className = 'football-tracker-history-section-heading'; heading.textContent = 'Upcoming'; if (hasActive) heading.textContent = 'Live / upcoming'; body.appendChild(heading);
        const list = document.createElement('div'); list.className = 'football-tracker-history-matches football-tracker-history-upcoming';
        [...upcoming].sort((left, right) => left.utcDate - right.utcDate).forEach(match => {
          const row = document.createElement('div'); row.className = 'football-tracker-history-match is-upcoming';
          const kickoff = new Date(match.utcDate); const date = document.createElement('time'); date.dateTime = kickoff.toISOString(); date.textContent = kickoff.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          const venue = document.createElement('span'); venue.className = 'football-tracker-history-venue'; venue.textContent = match.venue; venue.title = match.venue === 'H' ? 'Home' : 'Away';
          const opponent = _footballTrackerTeamNode(widget, match.opponent, false);
          const active = _footballTrackerActiveStatus(match.status);
          const time = document.createElement('strong'); time.className = 'football-tracker-history-score'; time.textContent = match.status === 'POSTPONED' ? 'TBC' : (active ? _footballTrackerStageLabel(match.status) : kickoff.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
          const status = document.createElement('span'); status.className = `football-tracker-history-result is-upcoming${active ? ' is-live' : ''}`; status.textContent = match.status === 'POSTPONED' ? 'P' : (active ? '●' : '→'); status.title = match.status === 'POSTPONED' ? 'Postponed' : (active ? _footballTrackerStageLabel(match.status) : 'Scheduled');
          row.append(date, venue, opponent, time, status); list.appendChild(row);
        }); body.appendChild(list);
      }
    }
  }
  (history.warnings || []).forEach(message => { const warning = _footballTrackerCoverageNote(message); if (warning) body.appendChild(warning); });
  element.appendChild(_footballTrackerRenderHistoryAttribution(history));
}

function _footballTrackerRender(widget, element, context) {
  const config = _footballTrackerConfig(widget); const runtime = _footballTrackerState(widget); const competition = _footballTrackerCompetition(widget);
  const rerender = () => { if (element.isConnected) _footballTrackerRender(widget, element, context); };
  _setWidgetRefresher(widget.id, context, rerender);
  element.className = `football-tracker-widget${context === 'navpane' ? ' is-compact' : ''}`; element.innerHTML = '';
  if (runtime.selectedTeam) { _footballTrackerRenderTeamHistory(widget, runtime, element); _setWidgetTimer(widget.id, context, () => _footballTrackerRefreshForDate(widget), _footballTrackerMsUntilDateChange()); return; }
  const header = document.createElement('div'); header.className = 'football-tracker-header'; const identity = document.createElement('div'); identity.className = 'football-tracker-identity'; const area = document.createElement('span'); area.textContent = competition.area; const title = document.createElement('strong'); title.textContent = competition.name; identity.append(area, title);
  const tabs = document.createElement('div'); tabs.className = 'football-tracker-tabs';
  const availableViews = [['matches', competition.kind === 'cup' ? 'Match days' : 'Matches']]; if (competition.hasStandings !== false) availableViews.push(['standings', 'Table']);
  availableViews.forEach(([view, label]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.classList.toggle('active', runtime.view === view); button.addEventListener('click', () => { runtime.view = view; _footballTrackerWriteView(widget, runtime); _refreshWidget(widget.id, 'column'); _refreshWidget(widget.id, 'navpane'); }); tabs.appendChild(button); });
  header.append(identity, tabs); element.appendChild(header); const body = document.createElement('div'); body.className = 'football-tracker-body'; element.appendChild(body);
  const provider = _footballTrackerProvider(competition);
  const canUseFallback = runtime.view === 'matches' && competition.theSportsDbFallback;
  if (!_footballTrackerProviderToken(competition) && !canUseFallback) { const empty = document.createElement('div'); empty.className = 'widget-empty-state'; empty.textContent = `Add a ${provider.name} credential in Settings > API Keys.`; body.appendChild(empty); }
  else {
    if (config.favouriteTeams.length) void _footballTrackerEnsureFavouriteMatches(widget);
    if (runtime.view === 'standings') _footballTrackerRenderStandings(widget, runtime, body); else _footballTrackerRenderMatches(widget, runtime, body);
  }
  const displayedProviders = [...new Set((runtime.data[runtime.view] || []).map(item => item?.competition?.provider).filter(Boolean))];
  if (!displayedProviders.length) displayedProviders.push(runtime.providers[runtime.view] || competition.provider);
  element.appendChild(_footballTrackerRenderHistoryAttribution({ providers: displayedProviders }));
  _setWidgetTimer(widget.id, context, () => _footballTrackerRefreshForDate(widget), _footballTrackerMsUntilDateChange());
}

function _footballTrackerRenderSettings(widget, container) {
  const config = _footballTrackerConfig(widget); const areas = [...new Set(FOOTBALL_TRACKER_COMPETITIONS.map(competition => competition.area))]; const selectedCompetition = _footballTrackerCompetition(widget);
  const escape = value => String(value || '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
  const favouriteSummary = config.favouriteTeams.length ? config.favouriteTeams.map(team => escape(team.name)).join(', ') : 'None selected';
  container.innerHTML = `<div class="settings-row settings-row--top"><span>Country / area</span><select class="settings-select football-tracker-settings-area">${areas.map(area => `<option value="${area}" ${selectedCompetition.area === area ? 'selected' : ''}>${area}</option>`).join('')}</select></div>
    <div class="settings-row settings-row--top"><span>League / competition</span><select class="settings-select football-tracker-settings-competition" data-cfg="competitionCode"></select></div>
    <div class="settings-row"><span>Default view</span><select class="settings-select football-tracker-settings-view" data-cfg="defaultView"><option value="matches" ${config.defaultView === 'matches' ? 'selected' : ''}>Matches</option><option value="standings" ${config.defaultView === 'standings' ? 'selected' : ''}>Table</option></select></div>
    <div class="settings-row"><span>Upcoming fixtures</span><select class="settings-select" data-cfg="historyUpcomingLimit"><option value="5" ${config.historyUpcomingLimit === 5 ? 'selected' : ''}>Next 5 fixtures</option><option value="10" ${config.historyUpcomingLimit === 10 ? 'selected' : ''}>Next 10 fixtures</option><option value="0" ${config.historyUpcomingLimit === 0 ? 'selected' : ''}>All upcoming fixtures</option></select></div>
    <div class="settings-row"><span>Show team crests</span><label class="settings-toggle"><input type="checkbox" data-cfg="showCrests" ${config.showCrests ? 'checked' : ''}/><span class="toggle-track"></span></label></div>
    <div class="settings-row settings-row--top"><span>Favourite teams</span><span class="settings-value">${favouriteSummary}</span></div>
    <div class="settings-help">Select favourite teams with the star beside their name in Table view. Their upcoming fixtures are available to Daily Briefing.</div>
    <div class="settings-help">Provider priority is automatic: football-data.org first, Sportmonks for its free Scottish coverage, then API-Football only for uncovered competitions. Data remains cached until the local date changes or you refresh manually.</div>`;
  const areaSelect = container.querySelector('.football-tracker-settings-area'); const competitionSelect = container.querySelector('.football-tracker-settings-competition'); const viewSelect = container.querySelector('.football-tracker-settings-view');
  const renderCompetitions = (preferredCode = '') => {
    const available = FOOTBALL_TRACKER_COMPETITIONS.filter(competition => competition.area === areaSelect.value); competitionSelect.innerHTML = '';
    available.forEach(competition => { const option = document.createElement('option'); option.value = competition.code; option.textContent = competition.name; competitionSelect.appendChild(option); });
    competitionSelect.value = available.some(competition => competition.code === preferredCode) ? preferredCode : (available[0]?.code || 'PL');
    const selected = _footballTrackerCompetition(competitionSelect.value); const tableOption = viewSelect.querySelector('option[value="standings"]');
    tableOption.disabled = selected.hasStandings === false;
    if (tableOption.disabled && viewSelect.value === 'standings') { viewSelect.value = 'matches'; viewSelect.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  renderCompetitions(config.competitionCode);
  areaSelect.addEventListener('change', () => { renderCompetitions(); competitionSelect.dispatchEvent(new Event('change', { bubbles: true })); });
  competitionSelect.addEventListener('change', () => renderCompetitions(competitionSelect.value));
}

WIDGET_REGISTRY['footballTracker'] = {
  id: 'footballTracker', name: 'Football Tracker', category: 'Sports',
  description: 'Follow domestic leagues, cups, UEFA tournaments, the Euros, and FIFA World Cup.',
  allowedIn: ['column', 'navpane'], liveSettingsPreview: false, reloadLabel: 'Refresh football data',
  defaultConfig: { competitionCode: 'PL', defaultView: 'matches', showCrests: true, historyUpcomingLimit: 5, favouriteTeam: '', favouriteTeams: [] }, defaultData: {},
  settingsSchema: { type: 'object', properties: { competitionCode: { type: 'string', enum: FOOTBALL_TRACKER_COMPETITIONS.map(competition => competition.code) }, defaultView: { type: 'string', enum: ['matches', 'standings'] }, showCrests: { type: 'boolean' }, historyUpcomingLimit: { type: 'number', enum: FOOTBALL_TRACKER_UPCOMING_LIMIT_OPTIONS }, favouriteTeam: { type: 'string' }, favouriteTeams: { type: 'array' } }, additionalProperties: false },
  capabilities: { network: { domains: ['api.football-data.org', 'crests.football-data.org', 'api.sportmonks.com', 'cdn.sportmonks.com', 'v3.football.api-sports.io', 'media.api-sports.io', 'www.thesportsdb.com', 'r2.thesportsdb.com'] }, extensionRelay: { optional: true }, localCache: { quotaBytes: 2 * 1024 * 1024 }, timers: true },
  responsive: { minWidth: 240, preferredWidth: 580, compactBelow: 340 },
  migrate(widget) { widget.config = { ...this.defaultConfig, ...(widget.config || {}) }; widget.data = {}; _footballTrackerConfig(widget); return widget; },
  reload(widget) { const runtime = _footballTrackerState(widget); return runtime.selectedTeam ? _footballTrackerLoadTeamHistory(widget, runtime.selectedTeam, true) : _footballTrackerLoad(widget, runtime.view, true); },
  onSettingsCommit(widget, previousConfig) {
    _footballTrackerRuntime.delete(widget.id); _footballTrackerViewMemory.delete(widget.id);
    if (widget.config.competitionCode !== previousConfig?.competitionCode || widget.config.defaultView !== previousConfig?.defaultView) WidgetSDK.cache.remove('footballTracker', widget.id, 'view');
  },
  dispose(widget) { _footballTrackerRuntime.delete(widget.id); _footballTrackerViewMemory.delete(widget.id); WidgetSDK.cache.remove('footballTracker', widget.id, 'view'); },
  cleanup(widget) { _footballTrackerRuntime.delete(widget.id); _footballTrackerViewMemory.delete(widget.id); },
  render(widget, element, context) { _footballTrackerRender(widget, element, context); }, renderSettings(widget, container) { _footballTrackerRenderSettings(widget, container); }
};

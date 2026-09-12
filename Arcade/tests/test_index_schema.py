from copy import deepcopy

import pytest

from arcade_core.index_schema import assign_groups, index_document
from arcade_core.catalogue_identity import CatalogueError
from arcade_core.shared_metadata import shared_rows


def test_upgrade_separates_letter_buckets_and_preserves_game_folder_versions():
    source = {'games': [
        {'id':'airwolf', 'file':'A/Airwolf.tap', 'title':'Airwolf'},
        {'id':'afterburner', 'file':'A/After Burner.tap', 'title':'After Burner'},
        {'id':'st', 'file':'Pirates/Pirates (ST).st', 'title':'Pirates'},
        {'id':'ste', 'file':'Pirates/Pirates (STe).st', 'title':'Pirates', 'emulator_profile':'ste'},
    ]}
    original = deepcopy(source)
    current = index_document(source)
    assert source == original
    a, b, st, ste = current['games']
    assert a['metadata_group_id'] != b['metadata_group_id']
    assert st['metadata_group_id'] == ste['metadata_group_id']
    st['title'] = 'Corrected title'
    st['description'] = 'Description from a reviewed scrape'
    assert index_document(current) == current
    assert ste['emulator_profile'] == 'ste'
    assert [row['id'] for row in current['games']] == [row['id'] for row in source['games']]
    # A subsequent discovery reuses the stored group despite the scraped title.
    st['scrape_family_title'] = 'Pirates'
    extra = {'id':'new', 'file':'Pirates/Pirates (revision).st', 'title':'Pirates'}
    current['games'].append(extra)
    assign_groups(current['games'])
    assert extra['metadata_group_id'] == st['metadata_group_id']


@pytest.mark.parametrize('document', [
    {'indexSchemaVersion':3,'games':[]},
    {'indexSchemaVersion':2,'games':[{'id':'x','file':'x.tap'}]},
    {'games':[{'id':'same','file':'one.tap'}, {'id':'same','file':'two.tap'}]},
])
def test_current_reader_rejects_unsupported_or_ambiguous_identity(document):
    with pytest.raises(CatalogueError):
        index_document(document)

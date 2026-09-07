import pytest

from arcade_core.game_presentation import language_codes


@pytest.mark.parametrize('values,label,expected', [
    ([], 'English', ['en']), ([], 'German / English', ['de', 'en']),
    (['FR'], 'English', ['fr']), ([], 'Unknown', []), (None, '', []),
    ([], 'English-looking filename.tap', []), (['EN', 'en'], '', ['en']),
])
def test_language_display_uses_explicit_codes_then_explicit_labels(values, label, expected):
    assert language_codes(values, label) == expected

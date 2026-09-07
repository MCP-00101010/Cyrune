"""Presentation normalization without rewriting source metadata or launch identities."""

import re


LANGUAGE_LABELS = dict(zip(
    ('arabic czech danish german greek english spanish finnish french croatian hungarian italian '
     'japanese korean dutch norwegian polish portuguese romanian russian slovak swedish turkish '
     'uzbek chinese ukrainian catalan basque hebrew').split(),
    'ar cs da de el en es fi fr hr hu it ja ko nl no pl pt ro ru sk sv tr uz zh uk ca eu he'.split()))


def language_codes(values, label=''):
    codes = []
    if isinstance(values, (list, tuple)):
        codes = [value.lower() for value in values[:16] if isinstance(value, str)
                 and re.fullmatch(r'[a-zA-Z]{2,3}(?:-[a-zA-Z]{2})?', value)]
    if not codes and isinstance(label, str) and len(label) <= 160:
        for token in re.split(r'[/,;]', label.lower()):
            code = LANGUAGE_LABELS.get(token.strip())
            if code:
                codes.append(code)
    return sorted(set(codes))

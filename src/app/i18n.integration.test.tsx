import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider, useI18n } from '../i18n/I18nProvider';

function Probe() {
  const { t } = useI18n();
  return <p>{t('app.loading')}</p>;
}

describe('i18n provider integration', () => {
  it('updates the document language and renders translated copy', () => {
    render(
      <I18nProvider locale="en-US">
        <Probe />
      </I18nProvider>,
    );

    expect(document.documentElement.lang).toBe('en-US');
    expect(screen.getByText('Preparing MochiNote...')).toBeVisible();
  });
});

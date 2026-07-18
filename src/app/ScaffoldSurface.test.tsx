import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScaffoldSurface } from './ScaffoldSurface';

describe('ScaffoldSurface', () => {
  it('renders the supplied surface copy and a single primary heading', () => {
    render(
      <ScaffoldSurface
        title="MochiNote"
        description="Không gian ghi chú"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'MochiNote' })).toBeVisible();
    expect(screen.getByText('Không gian ghi chú')).toBeVisible();
  });
});

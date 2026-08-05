import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeywordsInput } from '@/pages/dashboard/WorkflowBuilderPage';

/**
 * Regression cover for a bug that made the comma impossible to type in the
 * workflow builder's keyword fields.
 *
 * The input used to derive its value straight from the saved array:
 * typing "guide," parsed to ["guide"] (the empty tail is filtered out), which
 * re-rendered as "guide" and swallowed the character on the spot. The component
 * now keeps the raw text locally and only reports the parsed array upward.
 */

/** Mirrors how the config panel drives the input: parsed array is the state. */
function Harness({ onParsed, initial = [] }: { onParsed: (k: string[]) => void; initial?: string[] }) {
  const [keywords, setKeywords] = useState<string[]>(initial);
  return (
    <KeywordsInput
      id="kw"
      value={keywords}
      onChange={(next) => {
        setKeywords(next);
        onParsed(next);
      }}
    />
  );
}

describe('KeywordsInput', () => {
  it('lets the user type a comma and keeps it visible', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<Harness onParsed={onParsed} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'guide,');

    expect(input).toHaveValue('guide,');
  });

  it('keeps the separator while typing a multi-keyword list', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<Harness onParsed={onParsed} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'guide, freebie');

    expect(input).toHaveValue('guide, freebie');
    expect(onParsed).toHaveBeenLastCalledWith(['guide', 'freebie']);
  });

  it('reports a trimmed array without blank entries', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<Harness onParsed={onParsed} />);

    await user.type(screen.getByRole('textbox'), 'price ,, info ,');

    expect(onParsed).toHaveBeenLastCalledWith(['price', 'info']);
  });

  it('preserves keywords that contain a space', async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    render(<Harness onParsed={onParsed} />);

    await user.type(screen.getByRole('textbox'), 'free guide, dm me');

    expect(onParsed).toHaveBeenLastCalledWith(['free guide', 'dm me']);
  });

  it('re-syncs when a different node is selected', () => {
    const { rerender } = render(
      <KeywordsInput id="kw" value={['one', 'two']} onChange={() => {}} />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('one, two');

    rerender(<KeywordsInput id="kw" value={['other']} onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('other');
  });
});

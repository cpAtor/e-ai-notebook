import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a private Interview Prep Notebook and edits starter Sections without network calls', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const user = userEvent.setup()

    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Interview Prep Notebook' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Private by default')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()

    const dsaInput = screen.getByLabelText('Rename DSA Section')

    await user.clear(dsaInput)
    await user.type(dsaInput, 'Algorithms')
    await user.type(screen.getByLabelText('New Section name'), 'Behavioral')
    await user.click(screen.getByRole('button', { name: 'Add Section' }))
    await user.click(
      within(screen.getByRole('listitem', { name: 'Algorithms Section' })).getByRole(
        'button',
        { name: 'Remove Algorithms Section' },
      ),
    )

    expect(screen.queryByDisplayValue('Algorithms')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('System Design')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Research')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Behavioral')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

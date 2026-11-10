import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

const render = (source: string) => renderToStaticMarkup(<Markdown>{source}</Markdown>)

describe('Markdown', () => {
  it('renders GitHub flavored markdown, including the HTML that PR templates use', () => {
    const html = render('## Title\n\n- [x] done\n\n| a |\n| - |\n| 1 |\n\n<details><summary>More</summary>\n\nhidden\n\n</details>')
    expect(html).toContain('<h2')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<table')
    expect(html).toContain('<summary>More</summary>')
  })

  it('strips scripts, event handlers, javascript: links and template comments', () => {
    const html = render('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>\n\n[y](javascript:alert(2))\n\n<!-- hidden -->')
    expect(html).toContain('>y</a>')
    expect(html).not.toMatch(/<script|onerror|href="javascript:|hidden/)
  })

  it('opens links outside the app', () => {
    expect(render('[docs](https://example.com)')).toContain('target="_blank"')
  })
})

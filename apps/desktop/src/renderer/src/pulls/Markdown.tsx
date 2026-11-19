import type { ComponentProps, ElementType, JSX } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { cx } from '../ui/cx'

function styled<T extends keyof JSX.IntrinsicElements>(Tag: T, className: string) {
  return ({ node: _node, className: own, ...props }: ComponentProps<T> & ExtraProps) => {
    const Element = Tag as ElementType
    return <Element {...props} className={cx(className, own)} />
  }
}

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" className="text-accent hover:underline" />,
  h1: styled('h1', 'mt-4 mb-2 border-b border-line pb-1 text-lg font-semibold first:mt-0'),
  h2: styled('h2', 'mt-4 mb-2 border-b border-line pb-1 text-base font-semibold first:mt-0'),
  h3: styled('h3', 'mt-3 mb-1.5 font-semibold first:mt-0'),
  h4: styled('h4', 'mt-3 mb-1.5 font-semibold first:mt-0'),
  p: styled('p', 'my-2 first:mt-0 last:mb-0'),
  ul: styled('ul', 'my-2 list-disc pl-6 [&_ul]:my-0.5 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1'),
  ol: styled('ol', 'my-2 list-decimal pl-6 [&_ol]:my-0.5'),
  li: styled('li', 'my-0.5 [&>input]:mr-1.5'),
  blockquote: styled('blockquote', 'my-2 border-l-2 border-line-strong pl-3 text-muted'),
  pre: styled('pre', 'my-2 overflow-x-auto rounded-md bg-raised p-3 font-mono text-xs [&>code]:bg-transparent [&>code]:p-0'),
  code: styled('code', 'rounded bg-raised px-1 py-0.5 font-mono text-[0.9em]'),
  hr: styled('hr', 'my-3 border-line'),
  img: styled('img', 'inline max-w-full'),
  table: styled('table', 'my-2 block overflow-x-auto border-collapse text-sm'),
  th: styled('th', 'border border-line-strong bg-surface px-2 py-1 text-left font-semibold'),
  td: styled('td', 'border border-line-strong px-2 py-1'),
  details: styled('details', 'my-2 [&>summary]:cursor-pointer'),
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('break-words', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

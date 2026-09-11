import { Capabilities } from '../capabilities'
import { faqEntries } from './questions'

/**
 * Why: the prose lives here rather than on the homepage, which stays the size of a
 * business card on purpose. The capability sections come first because they say
 * what the product is; the questions answer what is left over.
 *
 * Each question is a heading rather than a `dt`, which reads better to a search
 * engine — the question text is the query — and is the only valid option: `dt`
 * forbids heading descendants, so a `dl` cannot carry them.
 */
export function FaqPage(): React.JSX.Element {
  return (
    <>
      <h1 className="text-ink flex flex-col gap-3 pt-24 text-[26px] leading-[1.2] font-semibold">
        Questions
        <span className="text-copy max-w-[620px] text-[16px] leading-[26px] font-normal">
          What an AI agent workspace is, and what AgentStart does with the idea.
        </span>
      </h1>

      <Capabilities />

      <h2 className="text-ink text-[17px] leading-[1.4] font-semibold">Common questions</h2>

      {faqEntries.map((entry) => (
        <section key={entry.question} className="flex flex-col gap-3">
          <h3 className="text-label max-w-[620px] font-medium">{entry.question}</h3>
          <p className="max-w-[620px]">{entry.answer}</p>
        </section>
      ))}
    </>
  )
}

import { LegalLayout, LegalSection } from './LegalLayout';
import { SALES_EMAIL } from '@/lib/plans';

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      seoTitle="Terms of Service | Automiq"
      seoDescription="The terms that govern your use of Automiq's Instagram automation platform."
      updated="26 July 2026"
    >
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Automiq. By creating an
        account or using the service, you agree to these Terms.
      </p>

      <LegalSection heading="1. The service">
        <p>
          Automiq lets you automate Instagram interactions — such as replying to comments, sending
          direct messages, and capturing leads — through the official Meta Graph API. Features and
          limits depend on your plan.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your responsibilities">
        <ul>
          <li>
            You must own or be authorized to manage the Instagram accounts you connect, and comply
            with{' '}
            <a href="https://help.instagram.com/581066165581870" target="_blank" rel="noreferrer">
              Instagram&rsquo;s Terms
            </a>{' '}
            and Community Guidelines.
          </li>
          <li>
            You are responsible for the content of your automated messages. Do not use Automiq to
            send spam, harassment, illegal content, or misleading messages.
          </li>
          <li>You must honour opt-out requests and applicable messaging and privacy laws.</li>
          <li>You must keep your login credentials secure.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <p>
          We enforce per-user and monthly sending limits to protect you and the platform. Attempting
          to bypass these limits, reverse-engineer the service, or abuse the Instagram API may result
          in suspension. Automiq is not affiliated with, endorsed by, or sponsored by Meta or
          Instagram.
        </p>
      </LegalSection>

      <LegalSection heading="4. Plans, billing &amp; trials">
        <p>
          Paid plans are billed in advance on a monthly or yearly basis. Trials, where offered, can
          be cancelled any time before they end. You can cancel your subscription at any time; access
          continues until the end of the current billing period. Fees already paid are
          non-refundable except where required by law.
        </p>
      </LegalSection>

      <LegalSection heading="5. Availability">
        <p>
          We aim for high availability but do not guarantee uninterrupted service. Instagram/Meta
          API changes or outages may temporarily affect automations. We may update or discontinue
          features with reasonable notice.
        </p>
      </LegalSection>

      <LegalSection heading="6. Termination">
        <p>
          You may stop using Automiq at any time. We may suspend or terminate accounts that violate
          these Terms or abuse the service. On termination, your data is handled as described in our
          Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclaimer &amp; liability">
        <p>
          Automiq is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum
          extent permitted by law, we are not liable for indirect or consequential damages, or for
          any action taken by Instagram/Meta against your account resulting from your use of
          automation.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <p>
          Questions about these Terms? Email us at{' '}
          <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

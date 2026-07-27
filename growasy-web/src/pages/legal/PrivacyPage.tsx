import { LegalLayout, LegalSection } from './LegalLayout';
import { SALES_EMAIL } from '@/lib/plans';

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      seoTitle="Privacy Policy | Automiq"
      seoDescription="How Automiq collects, uses, protects and lets you delete your data, including Instagram data accessed via the Meta Graph API."
      updated="26 July 2026"
    >
      <p>
        This Privacy Policy explains how Automiq (&ldquo;Automiq&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects, uses, and protects your information when you use our Instagram
        automation platform and website. By using Automiq, you agree to this policy.
      </p>

      <LegalSection heading="1. Information we collect">
        <ul>
          <li>
            <strong>Account data</strong> — your name, email address, and password (stored hashed)
            when you create an account.
          </li>
          <li>
            <strong>Instagram data</strong> — when you connect an Instagram professional account
            through the official Meta Graph API, we access your profile (username, name, profile
            picture), your media (posts and reels), and the comments, direct messages and story
            replies needed to run the automations you configure.
          </li>
          <li>
            <strong>Contacts</strong> — public usernames and, where a person voluntarily provides
            it, the email they submit in a lead-capture flow.
          </li>
          <li>
            <strong>Usage &amp; device data</strong> — basic logs, IP address and browser
            information used to operate and secure the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use your data">
        <ul>
          <li>To run the automations you set up (auto-replies, DMs, lead capture).</li>
          <li>To provide analytics, link tracking and account management features.</li>
          <li>To secure the platform, enforce plan limits, and prevent abuse.</li>
          <li>To send you service and billing notifications.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data, and we do not use your Instagram content for
          any purpose other than delivering the features you enable.
        </p>
      </LegalSection>

      <LegalSection heading="3. Instagram / Meta access tokens">
        <p>
          Access tokens issued by Meta are <strong>encrypted at rest using AES-256</strong> and are
          never exposed to your browser or to third parties. We request only the permissions
          required for the automations you use, and you can disconnect an account at any time — which
          revokes our access.
        </p>
      </LegalSection>

      <LegalSection heading="4. Sharing &amp; third parties">
        <p>
          We share data only with infrastructure providers that help us run the service (hosting,
          database, email delivery) and with Meta&rsquo;s APIs to perform the actions you request.
          These providers are bound to protect your data and use it only to provide their services.
        </p>
      </LegalSection>

      <LegalSection heading="5. Data retention &amp; deletion">
        <p>
          We keep your data while your account is active. You can delete individual Instagram
          connections, contacts, or automations at any time from the dashboard.
        </p>
        <p>
          <strong>To delete your account and all associated data</strong>, disconnect your Instagram
          accounts and email us at <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a> from your
          registered address with the subject &ldquo;Data deletion&rdquo;. We will permanently
          delete your data within 30 days. Removing Automiq from your Instagram/Meta settings also
          revokes our access immediately.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          We use encryption in transit (HTTPS), encryption at rest for sensitive tokens, hashed
          passwords, role-based access control, and rate limiting. No system is perfectly secure,
          but we work hard to protect your information.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          You may access, correct, export or delete your personal data. Contact us to exercise any
          of these rights.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <p>
          Questions about this policy? Email us at{' '}
          <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

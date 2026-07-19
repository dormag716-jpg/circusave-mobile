/**
 * CircuSave product-policy drafts for mobile legal UX.
 *
 * These are initial product-policy drafts for product presentation.
 * They are not attorney-approved legal opinions and should be reviewed
 * before production enforcement or regulatory filings.
 */

import type { Href } from 'expo-router';

export const LEGAL_VERSIONS = {
  terms: '2026-07-19',
  privacy: '2026-07-19',
  fundsDisclosure: '2026-07-19',
  electronicConsent: '2026-07-19',
} as const;

export type LegalDocumentId =
  | 'terms'
  | 'privacy'
  | 'fundsDisclosure'
  | 'electronicConsent';

export type LegalSection = {
  heading: string;
  body: string;
};

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  shortTitle: string;
  subtitle: string;
  /** Cast for Expo Router typed routes until generated types pick up /legal/* */
  href: Href;
  version: string;
  effectiveDateLabel: string;
  intro: string;
  sections: LegalSection[];
};

export const LEGAL_EFFECTIVE_DATE_LABEL = 'Effective date: July 19, 2026';

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    shortTitle: 'Terms of Service',
    subtitle: 'Rules for using CircuSave',
    href: '/legal/terms' as Href,
    version: LEGAL_VERSIONS.terms,
    effectiveDateLabel: LEGAL_EFFECTIVE_DATE_LABEL,
    intro:
      'This is an initial product-policy draft describing how CircuSave works. It is not attorney-approved legal advice. By creating an account or continuing to use CircuSave, you agree to these Terms of Service.',
    sections: [
      {
        heading: '1. Who we are',
        body:
          'CircuSave is a digital coordination and recordkeeping platform for savings circles (also known as susu, tanda, pardner, and similar community saving groups). CircuSave helps people organize circles, schedules, contribution records, communications, and payout order. CircuSave is not a bank, credit union, lender, escrow provider, trustee, investment company, or financial institution.',
      },
      {
        heading: '2. Eligibility',
        body:
          'You must be able to form a binding agreement under applicable law and provide accurate account information. You are responsible for keeping your login credentials secure and for activity under your account.',
      },
      {
        heading: '3. What CircuSave provides',
        body:
          'CircuSave provides software tools to create and manage savings circles, invite members, track contribution status, communicate within a circle, maintain records, and coordinate payout order. Features may change over time as we improve the product.',
      },
      {
        heading: '4. What CircuSave does not do',
        body:
          'CircuSave does not own, borrow, invest, or use member contribution funds. CircuSave does not hold member savings as a deposit account. A displayed pot balance or contribution total is a platform record based on information entered or confirmed by users and payment providers. CircuSave does not guarantee that any member will contribute, that funds will be available, or that a circle will complete as planned.',
      },
      {
        heading: '5. Payments and third parties',
        body:
          'Payments may be handled through independent payment providers and financial institutions (for example, card networks, banks, or other payment services). Those providers have their own terms, privacy policies, fees, and dispute processes. CircuSave may receive separately disclosed platform fees. The exact payment flow remains subject to the payment provider\'s terms and the way your circle chooses to exchange value.',
      },
      {
        heading: '6. Your responsibilities',
        body:
          'You should only participate with people you trust. You are responsible for verifying payment receipts outside the platform when required by your circle, for complying with applicable law, and for not using CircuSave for fraud, harassment, money laundering, or other unlawful activity. Organizers and members remain responsible for the real-world commitments they make to one another.',
      },
      {
        heading: '7. Records and communications',
        body:
          'CircuSave stores records you and other members create through the app, including membership, contribution status, payout order, and related activity. You consent to receive service-related notices through the app, email, SMS, or other contact methods you provide, as described in the Electronic Consent and Privacy Policy.',
      },
      {
        heading: '8. Subscriptions and platform fees',
        body:
          'Some features may require a paid CircuSave plan or platform fee. Fees for CircuSave services are separate from member-to-member contribution amounts. Fee amounts, billing cadence, and refund terms (if any) are disclosed in-product at the time of purchase or upgrade.',
      },
      {
        heading: '9. Account suspension and termination',
        body:
          'We may suspend or terminate access if we reasonably believe an account is used in a way that violates these terms, creates risk for other users, or harms the platform. You may stop using CircuSave at any time. Some records may be retained as needed for security, dispute history, legal obligations, or legitimate business purposes described in the Privacy Policy.',
      },
      {
        heading: '10. Disclaimers',
        body:
          'CircuSave is provided on an "as is" and "as available" basis to the fullest extent permitted by law. We do not promise uninterrupted service, error-free records when users enter incorrect information, or successful completion of any savings circle. Participation involves social and financial risk among members.',
      },
      {
        heading: '11. Limitation of liability',
        body:
          'To the fullest extent permitted by law, CircuSave and its operators are not liable for lost contributions between members, failed peer payments, incomplete circles, third-party payment provider outages, or indirect, incidental, special, consequential, or punitive damages arising from use of the platform. Nothing in these terms limits rights that cannot be limited under applicable law.',
      },
      {
        heading: '12. Changes',
        body:
          'We may update these Terms of Service. When we do, we will update the effective date and version shown in the app. Continued use after an update means you accept the revised terms, except where applicable law requires additional notice or consent.',
      },
      {
        heading: '13. Contact',
        body:
          'Questions about these terms can be sent through Help & Support in Settings. This draft is intended for product clarity and user acknowledgment during account creation.',
      },
    ],
  },

  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy Policy',
    subtitle: 'How we handle personal information',
    href: '/legal/privacy' as Href,
    version: LEGAL_VERSIONS.privacy,
    effectiveDateLabel: LEGAL_EFFECTIVE_DATE_LABEL,
    intro:
      'This is an initial product-policy draft describing how CircuSave handles personal information. It is not attorney-approved legal advice. It explains what we collect, why we collect it, and the choices available to you.',
    sections: [
      {
        heading: '1. Scope',
        body:
          'This Privacy Policy applies to the CircuSave mobile application and related services that link to it. CircuSave is a digital coordination and recordkeeping platform for savings circles. It is not a bank or financial institution.',
      },
      {
        heading: '2. Information we collect',
        body:
          'We may collect account details you provide (such as name, email, phone number, and password credentials), profile preferences, circle membership and organizer roles, contribution and payout records entered or confirmed in the app, device and app usage data needed for security and reliability, and communications you send through support or in-app features.',
      },
      {
        heading: '3. Payment-related information',
        body:
          'When payments are processed through independent payment providers, those providers may collect payment method details directly under their own policies. CircuSave may receive limited payment status information (for example, success, failure, amount, or reference identifiers) needed to update circle records. CircuSave does not treat a displayed pot total as a CircuSave deposit account balance.',
      },
      {
        heading: '4. How we use information',
        body:
          'We use information to operate the app, authenticate users, support circle coordination and recordkeeping, send service notices, prevent fraud and abuse, improve product reliability, and meet legal obligations. We may use aggregated or de-identified information to understand product performance.',
      },
      {
        heading: '5. How information is shared',
        body:
          'Circle members and organizers may see information needed for circle operation, such as display names, contribution status, payout order, and related activity. We may share information with service providers that help us host, secure, message, or operate the app, and with payment providers when needed to process or reconcile transactions. We may disclose information if required by law or to protect users, the platform, or the public from harm or fraud.',
      },
      {
        heading: '6. Retention',
        body:
          'We retain personal information for as long as your account is active and as needed for legitimate business, security, dispute history, and legal compliance purposes. Contribution and payout records may be retained longer when they are part of a circle\'s historical ledger.',
      },
      {
        heading: '7. Security',
        body:
          'We use administrative, technical, and organizational measures designed to protect personal information. No method of transmission or storage is completely secure, and you should protect your device and credentials.',
      },
      {
        heading: '8. Your choices',
        body:
          'You may update certain profile details in the app, adjust notification preferences where available, and request account-related help through Support. Depending on your location, you may have rights to access, correct, delete, or export personal information, or to object to certain processing. We will respond to valid requests as required by applicable law.',
      },
      {
        heading: '9. Children',
        body:
          'CircuSave is not directed to children under 13 (or the minimum age required in your jurisdiction). We do not knowingly collect personal information from children below that age.',
      },
      {
        heading: '10. International processing',
        body:
          'Information may be processed in the United States or other countries where we or our service providers operate. Where required, we use appropriate safeguards for cross-border transfers.',
      },
      {
        heading: '11. Changes',
        body:
          'We may update this Privacy Policy and will revise the effective date and version shown in the app when we do. Material changes may also be communicated in-app or by email when appropriate.',
      },
      {
        heading: '12. Contact',
        body:
          'Privacy questions can be submitted through Help & Support in Settings. This draft is intended to support transparent product disclosures during account creation and ongoing policy access.',
      },
    ],
  },

  fundsDisclosure: {
    id: 'fundsDisclosure',
    title: 'How Money Moves',
    shortTitle: 'How Money Moves',
    subtitle: 'Funds, pots, and platform role',
    href: '/legal/how-money-moves' as Href,
    version: LEGAL_VERSIONS.fundsDisclosure,
    effectiveDateLabel: LEGAL_EFFECTIVE_DATE_LABEL,
    intro:
      'This is an initial product-policy draft explaining how money-related activity is coordinated in CircuSave. It is not attorney-approved legal advice and does not make a final regulatory classification of the product.',
    sections: [
      {
        heading: '1. CircuSave\'s role',
        body:
          'CircuSave is a digital coordination and recordkeeping platform for savings circles. CircuSave helps users organize circles, schedules, contribution records, communications, and payout order. CircuSave is not a bank, credit union, lender, escrow provider, trustee, investment company, or financial institution.',
      },
      {
        heading: '2. What CircuSave does not do with contribution funds',
        body:
          'CircuSave does not own, borrow, invest, or use member contribution funds. CircuSave does not treat member contribution amounts as CircuSave operating capital. When members contribute in a savings circle, those contributions are intended for the circle\'s scheduled payout process among members according to the circle\'s rules and records.',
      },
      {
        heading: '3. Payments are handled by independent providers',
        body:
          'Payments are handled through independent payment providers and financial institutions. Depending on the flow enabled for your circle or market, funds may move between members\' own accounts, cards, banks, or other payment methods supported by those providers. The exact payment flow remains subject to the payment provider\'s terms, availability, verification requirements, and dispute procedures.',
      },
      {
        heading: '4. What a "pot" or contribution total means',
        body:
          'A displayed pot, contribution total, or similar balance in CircuSave is a platform record. It reflects status information entered, confirmed, or reported through the app and, where applicable, payment-provider signals. It is not a CircuSave deposit account and does not by itself mean CircuSave is holding cash for you in a CircuSave bank account.',
      },
      {
        heading: '5. Platform fees',
        body:
          'CircuSave may charge separately disclosed platform fees for software features, subscriptions, or related services. Those fees are distinct from member contribution amounts used for circle payouts. Fee details are shown in-product before you purchase or upgrade.',
      },
      {
        heading: '6. No guarantee of completion',
        body:
          'CircuSave does not guarantee that a member will contribute, that a payment will settle, or that a circle will complete. Savings circles depend on members fulfilling commitments to one another. Users should only participate with people they trust and should verify important payment events carefully.',
      },
      {
        heading: '7. Organizer and member responsibilities',
        body:
          'Organizers and members remain responsible for accurate recordkeeping inputs, confirming real-world payment receipt when required, and resolving disputes within their circle. CircuSave\'s tools are designed to improve transparency and coordination; they do not replace trust, good judgment, or applicable law.',
      },
      {
        heading: '8. Product description, not a final legal classification',
        body:
          'This disclosure describes product behavior: coordination, recordkeeping, and optional integration with independent payment providers. It does not assert a final regulatory conclusion about how every jurisdiction may classify every payment flow. As payment features evolve, disclosures may be updated to match the actual flow presented to users.',
      },
    ],
  },

  electronicConsent: {
    id: 'electronicConsent',
    title: 'Electronic Consent',
    shortTitle: 'Electronic Consent',
    subtitle: 'Agreements and notices by electronic means',
    href: '/legal/electronic-consent' as Href,
    version: LEGAL_VERSIONS.electronicConsent,
    effectiveDateLabel: LEGAL_EFFECTIVE_DATE_LABEL,
    intro:
      'This is an initial product-policy draft describing your consent to receive agreements and notices electronically. It is not attorney-approved legal advice.',
    sections: [
      {
        heading: '1. Consent to electronic delivery',
        body:
          'By accepting this Electronic Consent, you agree that CircuSave may provide required agreements, notices, disclosures, and records electronically. This may include Terms of Service updates, Privacy Policy updates, funds and fee disclosures, account notices, security alerts, and circle activity notices.',
      },
      {
        heading: '2. How we deliver electronic records',
        body:
          'Electronic records may be delivered in the CircuSave app, by email, by SMS or similar messaging where you provide a phone number, or by other electronic methods reasonably designed to reach you. Some notices may require you to open the app or a linked screen to review the full content.',
      },
      {
        heading: '3. Hardware and software requirements',
        body:
          'To access electronic records you need a compatible mobile device or computer, internet access, and the ability to view in-app screens or standard electronic documents and messages. You are responsible for maintaining access to the email address and phone number associated with your account.',
      },
      {
        heading: '4. Keeping your contact information current',
        body:
          'You agree to keep your account contact details accurate so that notices can reach you. If your email or phone number changes, update them in the app or contact Support promptly.',
      },
      {
        heading: '5. Paper copies and withdrawal',
        body:
          'You may request a copy of certain records through Support where reasonably available. If applicable law allows you to withdraw electronic-delivery consent, contact Support. Withdrawing consent may limit your ability to use parts of the service that depend on electronic delivery.',
      },
      {
        heading: '6. Legal effect',
        body:
          'Electronic records and electronic acceptance of agreements can have the same effect as paper records and handwritten signatures to the extent permitted by applicable law. This consent works together with the Terms of Service and Privacy Policy.',
      },
      {
        heading: '7. Changes',
        body:
          'We may update this Electronic Consent and will revise the effective date and version shown in the app when we do. Continued use after an update constitutes acceptance where permitted by law, subject to any additional notice requirements.',
      },
    ],
  },
};

export const LEGAL_MENU_ORDER: LegalDocumentId[] = [
  'terms',
  'privacy',
  'fundsDisclosure',
  'electronicConsent',
];

export function getLegalDocument(id: LegalDocumentId): LegalDocument {
  return LEGAL_DOCUMENTS[id];
}

export function listLegalDocuments(): LegalDocument[] {
  return LEGAL_MENU_ORDER.map((id) => LEGAL_DOCUMENTS[id]);
}

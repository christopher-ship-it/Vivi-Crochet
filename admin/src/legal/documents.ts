export type LegalBlock =
  | { type: 'lead'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'bullets'; items: string[] };

export type LegalDocument = {
  title: string;
  effectiveDate: string;
  blocks: LegalBlock[];
};

export const PRIVACY_DOCUMENT: LegalDocument = {
  title: 'Privacy Policy',
  effectiveDate: '16 September 2026',
  blocks: [
    {
      type: 'lead',
      text: 'VIVI Crochet (“VIVI”, “we”, “us”, or “our”) respects your privacy. This Privacy Policy explains how we collect, use, store, and protect information when you use the VIVI Crochet application and related services.',
    },
    {
      type: 'paragraph',
      text: 'This policy should be read together with the VIVI Terms & Conditions.',
    },
    { type: 'heading', text: '1. Information We Collect' },
    {
      type: 'paragraph',
      text: 'Depending on how you use VIVI, we may collect the following information.',
    },
    { type: 'subheading', text: 'Account Information' },
    {
      type: 'paragraph',
      text: 'Depending on your location and registration method:',
    },
    { type: 'paragraph', text: 'India:' },
    {
      type: 'bullets',
      items: ['Name', 'Mobile phone number', 'OTP/authentication information'],
    },
    { type: 'paragraph', text: 'Outside India:' },
    {
      type: 'bullets',
      items: ['Name', 'Email address', 'Password/authentication information'],
    },
    { type: 'subheading', text: 'Order Information' },
    {
      type: 'paragraph',
      text: 'When you purchase products, we may collect:',
    },
    {
      type: 'bullets',
      items: [
        'Name',
        'Phone number',
        'Delivery address',
        'City',
        'State',
        'PIN/postal code',
        'Country',
        'Order details',
        'Product and quantity information',
        'Order status',
        'Delivery information',
      ],
    },
    { type: 'subheading', text: 'Course Information' },
    {
      type: 'paragraph',
      text: 'If you purchase or access a course, we may process:',
    },
    {
      type: 'bullets',
      items: [
        'Course purchases',
        'Course access information',
        'Lesson completion',
        'Learning progress',
        'Course completion status',
        'Access expiry information',
      ],
    },
    { type: 'subheading', text: 'Live Class Information' },
    {
      type: 'paragraph',
      text: 'For live class bookings, we may process:',
    },
    {
      type: 'bullets',
      items: [
        'Customer name',
        'Phone/email',
        'Selected class',
        'Morning or Evening slot',
        'Booking date',
        'Week information',
        'Payment information/status',
        'Booking status',
      ],
    },
    { type: 'subheading', text: 'Payment Information' },
    {
      type: 'paragraph',
      text: 'Payments may be processed through third-party payment providers.',
    },
    {
      type: 'paragraph',
      text: 'VIVI may receive payment-related information such as:',
    },
    {
      type: 'bullets',
      items: [
        'Payment status',
        'Transaction/reference ID',
        'Amount',
        'Payment method information necessary to identify the transaction',
      ],
    },
    {
      type: 'paragraph',
      text: 'Where payment processing is performed by a third-party payment provider, payment credentials such as card details may be handled directly by that provider rather than stored by VIVI.',
    },
    { type: 'heading', text: '2. How We Use Your Information' },
    { type: 'paragraph', text: 'We may use personal information to:' },
    {
      type: 'bullets',
      items: [
        'Create and manage your account',
        'Authenticate your account',
        'Process orders',
        'Process payments',
        'Deliver products',
        'Provide customer support',
        'Provide purchased courses',
        'Track course access and progress',
        'Manage live class bookings',
        'Send booking confirmations',
        'Send order confirmations',
        'Send important account/service notifications',
        'Manage delivery information',
        'Prevent fraud and misuse',
        'Maintain application security',
        'Improve our products and services',
        'Comply with applicable legal obligations',
      ],
    },
    { type: 'heading', text: '3. Communication' },
    { type: 'paragraph', text: 'We may contact you through:' },
    {
      type: 'bullets',
      items: ['Email', 'SMS/OTP', 'Phone', 'In-app notifications'],
    },
    {
      type: 'paragraph',
      text: 'depending on the purpose and communication method available.',
    },
    { type: 'paragraph', text: 'For customers in India:' },
    {
      type: 'bullets',
      items: [
        'Phone / WhatsApp: +91 8754112435 (official business contact for WhatsApp and phone calls)',
        'Email: support@vivicrochet01.com',
      ],
    },
    { type: 'paragraph', text: 'For customers outside India:' },
    { type: 'bullets', items: ['Email: support@vivicrochet01.com'] },
    { type: 'heading', text: '4. Payment Providers' },
    {
      type: 'paragraph',
      text: 'Payments may be processed through third-party payment services.',
    },
    {
      type: 'paragraph',
      text: 'When you make a payment, the payment provider may independently process certain information according to its own privacy policy and terms.',
    },
    {
      type: 'paragraph',
      text: 'VIVI receives the information necessary to confirm and manage the transaction.',
    },
    { type: 'heading', text: '5. Service Providers' },
    {
      type: 'paragraph',
      text: 'VIVI may use trusted third-party service providers to operate the application and services.',
    },
    {
      type: 'paragraph',
      text: 'These may include providers supporting:',
    },
    {
      type: 'bullets',
      items: [
        'Cloud infrastructure',
        'Database hosting',
        'Secure file/video storage',
        'Payment processing',
        'Email communication',
        'Authentication',
        'Application analytics or technical monitoring',
      ],
    },
    {
      type: 'paragraph',
      text: 'Such providers may process information only as necessary to provide their services and subject to applicable contractual and legal requirements.',
    },
    { type: 'heading', text: '6. Course and Video Content' },
    {
      type: 'paragraph',
      text: 'If you purchase or access a VIVI course, we may process information necessary to verify your entitlement and provide access to the relevant lessons.',
    },
    {
      type: 'paragraph',
      text: 'Course access may be time-limited according to the course purchased.',
    },
    { type: 'heading', text: '7. Live Class Information' },
    {
      type: 'paragraph',
      text: 'When you book a live class, we process booking information necessary to:',
    },
    {
      type: 'bullets',
      items: [
        'Confirm your booking',
        'Reserve your seat',
        'Manage class capacity',
        'Send booking information',
        'Manage replacement classes',
        'Maintain booking records',
        'Provide customer support',
      ],
    },
    { type: 'heading', text: '8. Cookies and Similar Technologies' },
    {
      type: 'paragraph',
      text: 'The VIVI website or application may use technical storage, cookies, or similar technologies where necessary for:',
    },
    {
      type: 'bullets',
      items: [
        'Authentication',
        'Session management',
        'Security',
        'Preferences',
        'Application functionality',
        'Performance monitoring',
      ],
    },
    { type: 'heading', text: '9. Data Security' },
    {
      type: 'paragraph',
      text: 'We use reasonable technical and organizational measures designed to protect personal information against unauthorized access, misuse, alteration, disclosure, or destruction.',
    },
    {
      type: 'paragraph',
      text: 'However, no internet-based system can be guaranteed to be completely secure.',
    },
    { type: 'heading', text: '10. Data Retention' },
    {
      type: 'paragraph',
      text: 'We retain personal information only for as long as reasonably necessary for the purposes described in this Privacy Policy, including:',
    },
    {
      type: 'bullets',
      items: [
        'Providing services',
        'Maintaining account records',
        'Processing transactions',
        'Customer support',
        'Security and fraud prevention',
        'Legal and regulatory obligations',
        'Resolving disputes',
      ],
    },
    {
      type: 'paragraph',
      text: 'Certain transaction or legal records may need to be retained even after an account is deleted.',
    },
    { type: 'heading', text: '11. Account Deletion' },
    {
      type: 'paragraph',
      text: 'You may request deletion of your VIVI account.',
    },
    {
      type: 'paragraph',
      text: 'Account deletion may remove or disable access to:',
    },
    {
      type: 'bullets',
      items: [
        'Your profile',
        'Course access',
        'Learning progress',
        'Live class information',
        'Order history',
        'Saved items',
        'Other account-associated features',
      ],
    },
    {
      type: 'paragraph',
      text: 'Some information may be retained where required or permitted by applicable law, including information necessary for legal, accounting, security, fraud-prevention, or transaction-record purposes.',
    },
    { type: 'heading', text: '12. Your Privacy Rights' },
    {
      type: 'paragraph',
      text: 'Subject to applicable law, you may have rights relating to your personal information, including rights concerning:',
    },
    {
      type: 'bullets',
      items: [
        'Access to information',
        'Correction of inaccurate information',
        'Withdrawal of consent where consent is the basis for processing',
        'Deletion/erasure where applicable',
        'Complaints regarding personal-data processing',
      ],
    },
    {
      type: 'paragraph',
      text: 'The DPDP Act requires consent requests and notices to be presented in clear language and provides mechanisms concerning withdrawal and data rights.',
    },
    { type: 'paragraph', text: 'To make a privacy-related request, contact:' },
    { type: 'bullets', items: ['support@vivicrochet01.com'] },
    { type: 'heading', text: "13. Children's Privacy" },
    {
      type: 'paragraph',
      text: 'VIVI is not intended to knowingly collect personal information from children in circumstances where parental consent or other legal requirements apply.',
    },
    {
      type: 'paragraph',
      text: 'If you believe a child has provided personal information to VIVI inappropriately, contact us at:',
    },
    { type: 'bullets', items: ['support@vivicrochet01.com'] },
    { type: 'heading', text: '14. International Users' },
    {
      type: 'paragraph',
      text: 'VIVI may be accessed by customers outside India.',
    },
    {
      type: 'paragraph',
      text: 'International users should be aware that their information may be processed by VIVI and its service providers in jurisdictions where those providers operate, subject to applicable legal requirements.',
    },
    {
      type: 'paragraph',
      text: 'International users can contact VIVI by email:',
    },
    { type: 'bullets', items: ['support@vivicrochet01.com'] },
    { type: 'heading', text: '15. Changes to This Privacy Policy' },
    {
      type: 'paragraph',
      text: 'We may update this Privacy Policy from time to time to reflect changes in:',
    },
    {
      type: 'bullets',
      items: [
        'Our services',
        'Technology',
        'Legal requirements',
        'Data-processing practices',
      ],
    },
    {
      type: 'paragraph',
      text: 'The updated version will be made available through the VIVI application or website.',
    },
    { type: 'heading', text: '16. Contact Us' },
    { type: 'subheading', text: 'VIVI Crochet' },
    { type: 'paragraph', text: 'India customers:' },
    {
      type: 'bullets',
      items: [
        'Phone / WhatsApp: +91 8754112435 (official business contact for WhatsApp and phone calls)',
        'Email: support@vivicrochet01.com',
      ],
    },
    { type: 'paragraph', text: 'Customers outside India:' },
    { type: 'bullets', items: ['Email: support@vivicrochet01.com'] },
    {
      type: 'paragraph',
      text: 'For privacy requests, account deletion requests, or questions about personal information, please contact us by email.',
    },
  ],
};

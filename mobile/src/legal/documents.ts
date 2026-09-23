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

export const TERMS_DOCUMENT: LegalDocument = {
  title: 'Terms & Conditions',
  effectiveDate: '16 September 2026',
  blocks: [
    {
      type: 'lead',
      text: 'Welcome to VIVI Crochet (“VIVI”, “we”, “us”, or “our”). These Terms & Conditions (“Terms”) govern your use of the VIVI Crochet mobile application, website, products, courses, live classes, and related services.',
    },
    {
      type: 'paragraph',
      text: 'By creating an account, placing an order, purchasing a course, booking a live class, or using the VIVI application, you agree to these Terms.',
    },
    { type: 'heading', text: '1. About VIVI' },
    { type: 'paragraph', text: 'VIVI Crochet provides:' },
    {
      type: 'bullets',
      items: [
        'Handmade crochet products',
        'Crochet learning courses and video lessons',
        'Live crochet classes',
        'Related digital and physical crochet content and services',
      ],
    },
    {
      type: 'paragraph',
      text: 'You must provide accurate information when creating an account or placing an order.',
    },
    { type: 'heading', text: '2. Account Registration' },
    {
      type: 'paragraph',
      text: 'Users may access VIVI through the available registration and guest-access options.',
    },
    {
      type: 'paragraph',
      text: 'For users in India, VIVI may use phone number and OTP for account authentication.',
    },
    {
      type: 'paragraph',
      text: 'For users outside India, VIVI may use email and password authentication.',
    },
    {
      type: 'paragraph',
      text: 'You are responsible for maintaining the confidentiality of your account credentials and for activity conducted through your account.',
    },
    { type: 'heading', text: '3. Products and Orders' },
    {
      type: 'paragraph',
      text: 'VIVI offers handmade and other listed crochet products through the application.',
    },
    {
      type: 'paragraph',
      text: 'Product images, descriptions, prices, availability, and other information are displayed in the application.',
    },
    {
      type: 'paragraph',
      text: 'We make reasonable efforts to ensure that product information is accurate. Handmade products may have minor variations in appearance, texture, colour, or finish because they are individually crafted.',
    },
    { type: 'subheading', text: '3.1 Order Placement' },
    { type: 'paragraph', text: 'An order is considered placed after:' },
    {
      type: 'bullets',
      items: [
        'The customer completes checkout.',
        'Payment is successfully received/confirmed.',
        'VIVI confirms the order.',
      ],
    },
    { type: 'subheading', text: '3.2 Orders Cannot Be Cancelled' },
    {
      type: 'paragraph',
      text: 'Orders placed through VIVI cannot be cancelled by the customer after successful order placement.',
    },
    { type: 'paragraph', text: 'Please carefully review:' },
    {
      type: 'bullets',
      items: [
        'Product',
        'Quantity',
        'Delivery address',
        'Phone number',
        'Other order information',
      ],
    },
    { type: 'paragraph', text: 'before completing payment.' },
    { type: 'subheading', text: '3.3 No Voluntary Returns or Exchanges' },
    {
      type: 'paragraph',
      text: 'VIVI follows a no-return and no-exchange policy for successfully delivered orders, except where a return, replacement, refund, or other remedy is required under applicable law or where VIVI expressly agrees to provide such remedy.',
    },
    { type: 'paragraph', text: 'If you receive an item that is:' },
    {
      type: 'bullets',
      items: [
        'materially different from what was ordered,',
        'defective,',
        'damaged in transit, or',
        'otherwise eligible for a remedy under applicable law,',
      ],
    },
    { type: 'paragraph', text: 'please contact us promptly at:' },
    {
      type: 'bullets',
      items: ['Email: support@vivicrochet01.com', 'India Phone: +91 8438034181'],
    },
    {
      type: 'paragraph',
      text: 'VIVI may request photographs, videos, order information, or other information necessary to investigate the issue.',
    },
    { type: 'heading', text: '4. Pricing and Payment' },
    {
      type: 'paragraph',
      text: 'All prices displayed in the VIVI application are in the currency shown at checkout.',
    },
    {
      type: 'paragraph',
      text: 'For Indian customers, prices are generally displayed in Indian Rupees (₹).',
    },
    {
      type: 'paragraph',
      text: 'Payment must be completed using the payment methods made available by VIVI.',
    },
    {
      type: 'paragraph',
      text: 'An order is not considered successfully paid until payment confirmation is received by VIVI.',
    },
    { type: 'heading', text: '5. Delivery' },
    {
      type: 'paragraph',
      text: 'Customers must provide accurate delivery information, including:',
    },
    {
      type: 'bullets',
      items: [
        'Full Name',
        'Phone Number',
        'Address',
        'City',
        'State',
        'PIN/Postal Code',
        'Country',
        'Other required delivery information',
      ],
    },
    {
      type: 'paragraph',
      text: 'VIVI may provide an estimated delivery date or delivery window.',
    },
    {
      type: 'paragraph',
      text: "Estimated delivery dates are estimates and may change due to circumstances outside VIVI's reasonable control.",
    },
    {
      type: 'paragraph',
      text: 'Where applicable, the final delivery date shown for an order may be updated by VIVI.',
    },
    {
      type: 'paragraph',
      text: 'Customers are responsible for ensuring that the delivery address and contact information are correct.',
    },
    { type: 'heading', text: '6. Digital Courses and Learning Content' },
    {
      type: 'paragraph',
      text: 'VIVI may offer paid crochet courses and video lessons.',
    },
    {
      type: 'paragraph',
      text: 'Course access may be provided for the period specified for the relevant course or package.',
    },
    { type: 'paragraph', text: 'Access duration may vary between courses.' },
    { type: 'paragraph', text: 'Course content is provided for personal use only.' },
    { type: 'paragraph', text: 'You must not:' },
    {
      type: 'bullets',
      items: [
        'Copy course videos',
        'Download or redistribute protected course content',
        'Record and redistribute lessons',
        'Share account access',
        'Sell or sublicense course content',
        'Upload VIVI course content to another platform',
      ],
    },
    {
      type: 'paragraph',
      text: 'VIVI may suspend or terminate access if an account is found to be sharing or misusing protected content.',
    },
    { type: 'heading', text: '7. Live Crochet Classes' },
    { type: 'paragraph', text: 'VIVI may offer live crochet classes including:' },
    {
      type: 'bullets',
      items: [
        'Morning Crochet Circle — 10:00 AM – 12:00 PM',
        'Evening Crochet Circle — 6:00 PM – 8:00 PM',
      ],
    },
    { type: 'paragraph', text: 'Each slot has limited capacity.' },
    {
      type: 'paragraph',
      text: 'Availability displayed in the application is subject to actual booking availability.',
    },
    { type: 'heading', text: '8. Live Class Booking' },
    {
      type: 'paragraph',
      text: 'A live class booking is confirmed only after successful payment and booking confirmation.',
    },
    { type: 'subheading', text: '8.1 No Cancellation' },
    {
      type: 'paragraph',
      text: 'Once a live class booking is successfully completed, the customer cannot cancel the booking.',
    },
    {
      type: 'paragraph',
      text: 'The booking fee is therefore non-cancellable, subject to any rights that cannot legally be excluded.',
    },
    { type: 'subheading', text: '8.2 Missed Class' },
    {
      type: 'paragraph',
      text: 'If a customer misses a scheduled weekday class, VIVI may provide a replacement class on Saturday, according to the applicable weekly schedule and availability.',
    },
    {
      type: 'paragraph',
      text: 'Saturday is specifically used as the replacement day for a missed weekday class.',
    },
    {
      type: 'paragraph',
      text: 'Sunday is always an OFF day and is not used as a replacement class day.',
    },
    {
      type: 'paragraph',
      text: 'A missed class does not automatically create a refund or cancellation entitlement.',
    },
    { type: 'subheading', text: '8.3 Replacement Class' },
    {
      type: 'paragraph',
      text: "The replacement class is subject to VIVI's scheduling and operational availability.",
    },
    {
      type: 'paragraph',
      text: 'Customers should contact VIVI as soon as reasonably possible if they know that they will miss a scheduled class.',
    },
    { type: 'subheading', text: '8.4 VIVI-Cancelled Classes' },
    {
      type: 'paragraph',
      text: 'If VIVI cancels or is unable to conduct a scheduled class, VIVI may provide an alternative class, rescheduling option, or other appropriate remedy, subject to the circumstances and applicable law.',
    },
    { type: 'heading', text: '9. Live Class Conduct' },
    {
      type: 'paragraph',
      text: 'Customers attending live classes are expected to behave respectfully.',
    },
    {
      type: 'paragraph',
      text: 'VIVI may restrict or terminate participation where a customer:',
    },
    {
      type: 'bullets',
      items: [
        'Harasses another participant',
        'Uses abusive or offensive language',
        'Disrupts the class',
        'Attempts to misuse the service',
        'Shares restricted course/class content without permission',
      ],
    },
    { type: 'heading', text: '10. Intellectual Property' },
    { type: 'paragraph', text: 'All VIVI content, including:' },
    {
      type: 'bullets',
      items: [
        'Brand elements',
        'Logos',
        'Images',
        'Videos',
        'Course materials',
        'Text',
        'Designs',
        'Graphics',
        'Application UI',
        'Original crochet patterns and educational materials',
      ],
    },
    {
      type: 'paragraph',
      text: 'are owned by or licensed to VIVI unless otherwise stated.',
    },
    {
      type: 'paragraph',
      text: 'You may not reproduce, modify, distribute, sell, or commercially exploit VIVI content without written permission.',
    },
    { type: 'heading', text: '11. Account Deletion' },
    {
      type: 'paragraph',
      text: 'You may request deletion of your VIVI account through the account deletion functionality provided in the application, where available, or by contacting us.',
    },
    {
      type: 'paragraph',
      text: 'Account deletion may result in loss of access to:',
    },
    {
      type: 'bullets',
      items: [
        'Purchased course access',
        'Learning progress',
        'Live class information',
        'Order history',
        'Saved items',
        'Account information',
      ],
    },
    {
      type: 'paragraph',
      text: 'Certain information may need to be retained where required by law, for legitimate legal, accounting, security, fraud-prevention, or transaction-record purposes.',
    },
    { type: 'heading', text: '12. Privacy' },
    {
      type: 'paragraph',
      text: 'Your use of VIVI is also governed by our Privacy Policy, which explains how we collect, use, store, and protect personal information.',
    },
    { type: 'heading', text: '13. Changes to Services' },
    {
      type: 'paragraph',
      text: 'VIVI may modify, update, suspend, or discontinue features or services from time to time.',
    },
    {
      type: 'paragraph',
      text: 'Where appropriate, material changes will be communicated through the application or other reasonable means.',
    },
    { type: 'heading', text: '14. Limitation of Liability' },
    {
      type: 'paragraph',
      text: "To the extent permitted by applicable law, VIVI will not be responsible for losses caused by circumstances outside its reasonable control, including internet outages, payment-provider failures, courier delays, natural events, or other events beyond VIVI's reasonable control.",
    },
    {
      type: 'paragraph',
      text: 'Nothing in these Terms is intended to exclude any liability or consumer right that cannot legally be excluded.',
    },
    { type: 'heading', text: '15. Governing Law' },
    {
      type: 'paragraph',
      text: 'These Terms are governed by the applicable laws of India.',
    },
    {
      type: 'paragraph',
      text: 'Nothing in these Terms is intended to remove or restrict any mandatory consumer or other legal rights applicable to you.',
    },
    { type: 'heading', text: '16. Contact VIVI' },
    { type: 'subheading', text: 'Customers in India' },
    {
      type: 'bullets',
      items: ['Phone: +91 8438034181', 'Email: support@vivicrochet01.com'],
    },
    { type: 'subheading', text: 'Customers outside India' },
    { type: 'bullets', items: ['Email: support@vivicrochet01.com'] },
    {
      type: 'paragraph',
      text: 'For order, class, account, privacy, or other support queries, please include your relevant order ID or account information where applicable.',
    },
  ],
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
      items: ['Phone: +91 8438034181', 'Email: support@vivicrochet01.com'],
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
      items: ['Phone: +91 8438034181', 'Email: support@vivicrochet01.com'],
    },
    { type: 'paragraph', text: 'Customers outside India:' },
    { type: 'bullets', items: ['Email: support@vivicrochet01.com'] },
    {
      type: 'paragraph',
      text: 'For privacy requests, account deletion requests, or questions about personal information, please contact us by email.',
    },
  ],
};

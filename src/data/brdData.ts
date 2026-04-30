export interface BRDSection {
  id: string;
  title: string;
  content: string;
  sentences: BRDSentence[];
}

export interface BRDSentence {
  id: string;
  text: string;
  hasConflict?: boolean;
  evidence?: Evidence[];
}

export interface Evidence {
  id: string;
  platform: 'slack' | 'email' | 'meeting';
  author: string;
  timestamp: string;
  content: string;
  avatarInitials: string;
}

export interface BRDVersion {
  id: string;
  version: string;
  timestamp: string;
  savedBy: string;
  diffSummary: string;
  qualityScore: number;
}

export const mockEvidence: Record<string, Evidence[]> = {
  's1': [
    {
      id: 'e1',
      platform: 'slack',
      author: 'Sarah Chen',
      timestamp: '2026-02-14 10:23 AM',
      content: 'The new portal needs to handle at least 50k concurrent users at launch. Engineering confirmed this is feasible with horizontal scaling.',
      avatarInitials: 'SC',
    },
    {
      id: 'e2',
      platform: 'email',
      author: 'James Rao',
      timestamp: '2026-02-13 3:45 PM',
      content: 'Per our discussion, the primary goal is reducing customer support tickets by 40% through self-service capabilities.',
      avatarInitials: 'JR',
    },
  ],
  's2': [
    {
      id: 'e3',
      platform: 'meeting',
      author: 'Sarah Chen',
      timestamp: '2026-02-12 — 14:32',
      content: 'Users must be able to manage their subscriptions without contacting support. This includes upgrade, downgrade, and cancellation flows.',
      avatarInitials: 'SC',
    },
  ],
  's3': [
    {
      id: 'e4',
      platform: 'slack',
      author: 'Alex Kim',
      timestamp: '2026-02-15 9:11 AM',
      content: 'Wait — did we agree on 2-factor auth being mandatory or optional? I thought it was optional for standard users.',
      avatarInitials: 'AK',
    },
    {
      id: 'e5',
      platform: 'email',
      author: 'James Rao',
      timestamp: '2026-02-15 11:02 AM',
      content: '2FA must be mandatory for all admin roles per security policy. Standard users can opt in.',
      avatarInitials: 'JR',
    },
  ],
};

export const mockBRDSections: BRDSection[] = [
  {
    id: 'exec-summary',
    title: 'Executive Summary',
    content: '',
    sentences: [
      {
        id: 's1',
        text: 'The Customer Portal Redesign initiative aims to deliver a unified self-service platform capable of handling 50,000 concurrent users, reducing customer support ticket volume by 40% within six months of launch.',
        evidence: mockEvidence['s1'],
      },
      {
        id: 's1b',
        text: 'This document defines the business requirements for the redesign, including functional scope, stakeholder expectations, and measurable success criteria.',
      },
    ],
  },
  {
    id: 'stakeholders',
    title: 'Stakeholder Register',
    content: '',
    sentences: [
      {
        id: 'sk1',
        text: 'Sarah Chen (Product Owner) — Accountable for product vision and acceptance criteria.',
      },
      {
        id: 'sk2',
        text: 'James Rao (Tech Lead) — Responsible for technical feasibility assessments and architecture decisions.',
      },
      {
        id: 'sk3',
        text: 'Alex Kim (Business Analyst) — Responsible for requirements elicitation and documentation.',
      },
    ],
  },
  {
    id: 'functional-req',
    title: 'Functional Requirements',
    content: '',
    sentences: [
      {
        id: 's2',
        text: 'FR-01: Users shall be able to manage subscription plans — including upgrade, downgrade, and cancellation — without requiring assistance from the support team.',
        evidence: mockEvidence['s2'],
      },
      {
        id: 's3',
        text: 'FR-02: The system shall enforce two-factor authentication (2FA) for all users with administrative privileges; standard users may opt in voluntarily.',
        hasConflict: true,
        evidence: mockEvidence['s3'],
      },
      {
        id: 'fr3',
        text: 'FR-03: The portal shall surface real-time usage metrics and billing history accessible to all authenticated users.',
      },
      {
        id: 'fr4',
        text: 'FR-04: Users shall receive automated email notifications for billing events, subscription changes, and account activity.',
      },
    ],
  },
  {
    id: 'non-functional-req',
    title: 'Non-Functional Requirements',
    content: '',
    sentences: [
      {
        id: 'nfr1',
        text: 'NFR-01: The platform shall maintain 99.9% uptime SLA measured on a rolling 30-day basis.',
      },
      {
        id: 'nfr2',
        text: 'NFR-02: Page load time shall not exceed 2 seconds at the 95th percentile under peak load conditions.',
      },
      {
        id: 'nfr3',
        text: 'NFR-03: All data at rest and in transit shall be encrypted using AES-256 and TLS 1.3 respectively.',
      },
    ],
  },
  {
    id: 'assumptions',
    title: 'Assumptions & Constraints',
    content: '',
    sentences: [
      {
        id: 'a1',
        text: 'ASSUMPTION-01: The existing authentication service (Auth0) will be retained and extended rather than replaced.',
      },
      {
        id: 'a2',
        text: 'CONSTRAINT-01: The project must go live before Q3 2026 to align with the annual pricing review cycle.',
      },
      {
        id: 'a3',
        text: 'CONSTRAINT-02: Budget is capped at $480,000 inclusive of design, development, QA, and infrastructure.',
      },
    ],
  },
  {
    id: 'success-metrics',
    title: 'Success Metrics',
    content: '',
    sentences: [
      {
        id: 'sm1',
        text: 'SM-01: Customer support ticket volume reduced by ≥40% within 180 days of launch.',
      },
      {
        id: 'sm2',
        text: 'SM-02: Customer Satisfaction Score (CSAT) for portal interactions ≥4.2/5.0.',
      },
      {
        id: 'sm3',
        text: 'SM-03: Self-service task completion rate ≥78% measured via in-product analytics.',
      },
    ],
  },
  {
    id: 'traceability',
    title: 'Traceability Matrix',
    content: '',
    sentences: [
      {
        id: 'tr1',
        text: 'FR-01 ↔ SM-01, SM-03 | NFR-01 ↔ SM-01 | FR-03 ↔ SM-02',
      },
    ],
  },
];

export const mockBRDVersions: BRDVersion[] = [
  {
    id: 'v3',
    version: 'v3.0',
    timestamp: '2026-02-18 14:32',
    savedBy: 'Sarah Chen',
    diffSummary: 'Added FR-04 (email notifications). Resolved conflict in FR-02 after team discussion.',
    qualityScore: 84,
  },
  {
    id: 'v2',
    version: 'v2.0',
    timestamp: '2026-02-16 09:15',
    savedBy: 'Alex Kim',
    diffSummary: 'Added Non-Functional Requirements section. Updated Success Metrics with measurable targets.',
    qualityScore: 71,
  },
  {
    id: 'v1',
    version: 'v1.0',
    timestamp: '2026-02-14 11:00',
    savedBy: 'Alex Kim',
    diffSummary: 'Initial BRD draft generated from Slack and email sources.',
    qualityScore: 55,
  },
];

export const mockAIMessages = [
  {
    id: 'm1',
    type: 'ai' as const,
    text: '⚠️ FR-03 is missing a success metric. What does a successful outcome look like for real-time usage metrics?',
    timestamp: '14:31',
  },
  {
    id: 'm2',
    type: 'ai' as const,
    text: '⚠️ I detected a conflict in FR-02 regarding 2FA enforcement scope. Two sources disagree on whether it applies to all users or admins only. Do you want me to flag this for stakeholder resolution?',
    timestamp: '14:31',
  },
  {
    id: 'm3',
    type: 'ai' as const,
    text: '✅ Completeness check: Executive Summary, Stakeholder Register, and Assumptions sections look solid. NFR section could benefit from a data retention requirement.',
    timestamp: '14:32',
  },
];

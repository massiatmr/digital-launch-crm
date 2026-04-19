import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { LogoHeader } from './logo-header.tsx'

const SITE_NAME = 'Digital Launch CRM'

interface WorkspaceInvitationProps {
  workspaceName?: string
  inviterName?: string
  acceptUrl?: string
  role?: string
}

const WorkspaceInvitationEmail = ({
  workspaceName,
  inviterName,
  acceptUrl,
  role,
}: WorkspaceInvitationProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>
      Tu es invité à rejoindre {workspaceName || 'un espace de travail'} sur {SITE_NAME}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <LogoHeader />
        <Heading style={h1}>Tu as été invité 🎉</Heading>

        <Text style={text}>
          {inviterName ? `${inviterName} t'a invité` : 'Tu as été invité'} à rejoindre
          {' '}
          <strong>{workspaceName || 'un espace de travail'}</strong>
          {role ? ` en tant que ${role === 'owner' ? 'propriétaire' : 'membre'}` : ''}
          {' '}sur {SITE_NAME}.
        </Text>

        <Section style={{ textAlign: 'center' as const, margin: '30px 0' }}>
          <Button style={ctaButton} href={acceptUrl || '#'}>
            Accepter l'invitation
          </Button>
        </Section>

        <Text style={text}>
          En acceptant, tu auras accès aux leads, clients, automatisations et tableaux de
          bord de cet espace.
        </Text>

        <Hr style={hr} />

        <Text style={footerText}>
          Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :
          <br />
          <span style={{ wordBreak: 'break-all' as const, color: '#7c3aed' }}>{acceptUrl}</span>
        </Text>

        <Text style={footer}>
          À bientôt,<br />
          L'équipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WorkspaceInvitationEmail,
  subject: (data: Record<string, any>) =>
    `Invitation à rejoindre ${data.workspaceName || 'un espace'} sur ${SITE_NAME}`,
  displayName: "Invitation espace de travail",
  previewData: {
    workspaceName: 'Acme Corp',
    inviterName: 'Jean Dupont',
    acceptUrl: 'https://digital-launch-crm.lovable.app/auth?invite=demo-token',
    role: 'member',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const ctaButton = {
  backgroundColor: '#7c3aed',
  color: '#ffffff',
  padding: '14px 32px',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e5e5e5', margin: '25px 0' }
const footerText = { fontSize: '12px', color: '#888', lineHeight: '1.5', margin: '0 0 16px' }
const footer = { fontSize: '13px', color: '#999', margin: '20px 0 0', lineHeight: '1.5' }

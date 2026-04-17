import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { LogoHeader } from './logo-header.tsx'

const SITE_NAME = "Digital Launch CRM"

interface NewLeadNotificationProps {
  leadName?: string
  leadEmail?: string
  leadPhone?: string
  leadCompany?: string
  leadSource?: string
  leadMessage?: string
  leadUrl?: string
}

const sourceLabels: Record<string, string> = {
  facebook: 'Facebook Ads',
  website: 'Site web',
  google_sheets: 'Google Sheets',
  manual: 'Saisie manuelle',
  organic_social: 'Réseaux organic',
  recommendation: 'Recommandation',
  google_my_business: 'Google My Business',
  other: 'Autre',
}

const NewLeadNotificationEmail = ({
  leadName,
  leadEmail,
  leadPhone,
  leadCompany,
  leadSource,
  leadMessage,
  leadUrl,
}: NewLeadNotificationProps) => {
  const sourceLabel = leadSource ? (sourceLabels[leadSource] || leadSource) : 'Inconnue'
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>🔥 Nouveau lead : {leadName || 'Sans nom'} ({sourceLabel})</Preview>
      <Body style={main}>
        <Container style={container}>
          <LogoHeader />
          <Heading style={h1}>🔥 Nouveau lead reçu</Heading>
          <Text style={text}>
            Un nouveau prospect vient d'arriver dans ton CRM. Réagis vite — la rapidité de réponse double tes chances de closing.
          </Text>

          <Section style={detailsBox}>
            <Text style={detailLabel}>👤 Nom</Text>
            <Text style={detailValue}>{leadName || '—'}</Text>

            {leadCompany && (
              <>
                <Text style={detailLabel}>🏢 Entreprise</Text>
                <Text style={detailValue}>{leadCompany}</Text>
              </>
            )}

            {leadEmail && (
              <>
                <Text style={detailLabel}>✉️ Email</Text>
                <Text style={detailValue}>{leadEmail}</Text>
              </>
            )}

            {leadPhone && (
              <>
                <Text style={detailLabel}>📱 Téléphone</Text>
                <Text style={detailValue}>{leadPhone}</Text>
              </>
            )}

            <Text style={detailLabel}>📥 Source</Text>
            <Text style={detailValue}>{sourceLabel}</Text>

            {leadMessage && (
              <>
                <Text style={detailLabel}>💬 Message</Text>
                <Text style={detailValue}>{leadMessage}</Text>
              </>
            )}
          </Section>

          {leadUrl && (
            <Section style={{ textAlign: 'center' as const, margin: '25px 0' }}>
              <Button style={ctaButton} href={leadUrl}>
                Ouvrir la fiche lead
              </Button>
            </Section>
          )}

          <Hr style={hr} />

          <Text style={footer}>
            {SITE_NAME} — notification automatique
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NewLeadNotificationEmail,
  subject: (data: Record<string, any>) =>
    `🔥 Nouveau lead — ${data.leadName || 'Sans nom'}${data.leadCompany ? ` (${data.leadCompany})` : ''}`,
  displayName: 'Notification nouveau lead',
  previewData: {
    leadName: 'Marie Dupont',
    leadEmail: 'marie@exemple.com',
    leadPhone: '+33612345678',
    leadCompany: 'Déménagements Dupont',
    leadSource: 'facebook',
    leadMessage: 'Intéressée par votre offre marketing.',
    leadUrl: 'https://digital-launch-crm.lovable.app/leads/123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const detailsBox = {
  backgroundColor: '#f4f0ff',
  borderRadius: '12px',
  padding: '20px 24px',
  margin: '20px 0',
  borderLeft: '4px solid #7c3aed',
}
const detailLabel = { fontSize: '12px', color: '#7c3aed', fontWeight: '600' as const, margin: '8px 0 2px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const detailValue = { fontSize: '16px', color: '#1a1a2e', fontWeight: '600' as const, margin: '0 0 8px' }
const ctaButton = {
  backgroundColor: '#7c3aed',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
}
const hr = { borderColor: '#e5e5e5', margin: '25px 0' }
const footer = { fontSize: '13px', color: '#999', margin: '20px 0 0', lineHeight: '1.5' }

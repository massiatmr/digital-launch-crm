import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Digital Launch CRM"

interface BookingConfirmationProps {
  name?: string
  bookingDate?: string
  timeSlot?: string
  offerName?: string
  meetLink?: string
}

const BookingConfirmationEmail = ({
  name,
  bookingDate,
  timeSlot,
  offerName,
  meetLink,
}: BookingConfirmationProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Votre rendez-vous est confirmé — {bookingDate} à {timeSlot}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name}, votre rendez-vous est confirmé ! ✅` : 'Votre rendez-vous est confirmé ! ✅'}
        </Heading>

        <Text style={text}>
          Nous avons bien enregistré votre rendez-vous. Voici les détails :
        </Text>

        <Section style={detailsBox}>
          <Text style={detailLabel}>📅 Date</Text>
          <Text style={detailValue}>{bookingDate || '—'}</Text>
          <Text style={detailLabel}>🕐 Heure</Text>
          <Text style={detailValue}>{timeSlot || '—'}</Text>
          {offerName && (
            <>
              <Text style={detailLabel}>📋 Offre</Text>
              <Text style={detailValue}>{offerName}</Text>
            </>
          )}
        </Section>

        {meetLink && (
          <Section style={{ textAlign: 'center' as const, margin: '25px 0' }}>
            <Button style={meetButton} href={meetLink}>
              Rejoindre le Google Meet
            </Button>
          </Section>
        )}

        <Hr style={hr} />

        <Text style={text}>
          Si vous devez annuler ou reporter votre rendez-vous, merci de nous contacter dès que possible.
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
  component: BookingConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `Confirmation RDV — ${data.bookingDate || ''} à ${data.timeSlot || ''}`,
  displayName: 'Confirmation de rendez-vous',
  previewData: {
    name: 'Marie Dupont',
    bookingDate: '2026-04-01',
    timeSlot: '14:00',
    offerName: 'Consultation Stratégie',
    meetLink: 'https://meet.google.com/abc-defg-hij',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px' }
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
const meetButton = {
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

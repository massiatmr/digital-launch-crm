import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { LogoHeader } from './logo-header.tsx'

const SITE_NAME = "Digital Launch CRM"

interface BookingRescheduledProps {
  name?: string
  oldDate?: string
  oldTime?: string
  newDate?: string
  newTime?: string
  offerName?: string
  meetLink?: string
  reason?: string
}

const BookingRescheduledEmail = ({
  name,
  oldDate,
  oldTime,
  newDate,
  newTime,
  offerName,
  meetLink,
  reason,
}: BookingRescheduledProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Votre rendez-vous a été reporté — {newDate} à {newTime}</Preview>
    <Body style={main}>
      <Container style={container}>
        <LogoHeader />
        <Heading style={h1}>
          {name ? `${name}, votre rendez-vous a été reporté 📅` : 'Votre rendez-vous a été reporté 📅'}
        </Heading>

        <Text style={text}>
          Suite à un changement d'agenda, votre rendez-vous{offerName ? ` pour « ${offerName} »` : ''} a été déplacé.
        </Text>

        {(oldDate || oldTime) && (
          <Section style={oldBox}>
            <Text style={oldLabel}>Ancien créneau</Text>
            <Text style={oldValue}>
              <s>{oldDate} {oldTime ? `à ${oldTime}` : ''}</s>
            </Text>
          </Section>
        )}

        <Section style={detailsBox}>
          <Text style={detailLabel}>📅 Nouvelle date</Text>
          <Text style={detailValue}>{newDate || '—'}</Text>
          <Text style={detailLabel}>🕐 Nouvelle heure</Text>
          <Text style={detailValue}>{newTime || '—'}</Text>
          {offerName && (
            <>
              <Text style={detailLabel}>📋 Offre</Text>
              <Text style={detailValue}>{offerName}</Text>
            </>
          )}
        </Section>

        {reason && (
          <Text style={reasonText}>
            <strong>Motif :</strong> {reason}
          </Text>
        )}

        {meetLink && (
          <Section style={{ textAlign: 'center' as const, margin: '25px 0' }}>
            <Button style={meetButton} href={meetLink}>
              Rejoindre le Google Meet
            </Button>
          </Section>
        )}

        <Hr style={hr} />

        <Text style={text}>
          Si ce nouveau créneau ne vous convient pas, répondez simplement à cet email et nous trouverons une alternative.
        </Text>

        <Text style={footer}>
          À très bientôt,<br />
          L'équipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingRescheduledEmail,
  subject: (data: Record<string, any>) =>
    `📅 RDV reporté — ${data.newDate || ''} à ${data.newTime || ''}`,
  displayName: 'Report de rendez-vous',
  previewData: {
    name: 'Marie Dupont',
    oldDate: '2026-04-01',
    oldTime: '14:00',
    newDate: '2026-04-03',
    newTime: '10:30',
    offerName: 'Consultation Stratégie',
    meetLink: 'https://meet.google.com/abc-defg-hij',
    reason: 'Indisponibilité de dernière minute',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const oldBox = {
  backgroundColor: '#fafafa',
  borderRadius: '10px',
  padding: '12px 18px',
  margin: '12px 0',
  border: '1px solid #eee',
}
const oldLabel = { fontSize: '11px', color: '#999', fontWeight: '600' as const, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const oldValue = { fontSize: '14px', color: '#999', margin: '0' }
const detailsBox = {
  backgroundColor: '#f4f0ff',
  borderRadius: '12px',
  padding: '20px 24px',
  margin: '20px 0',
  borderLeft: '4px solid #7c3aed',
}
const detailLabel = { fontSize: '12px', color: '#7c3aed', fontWeight: '600' as const, margin: '8px 0 2px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const detailValue = { fontSize: '16px', color: '#1a1a2e', fontWeight: '600' as const, margin: '0 0 8px' }
const reasonText = { fontSize: '14px', color: '#555', lineHeight: '1.5', margin: '10px 0 16px', padding: '10px 14px', backgroundColor: '#fff8e6', borderRadius: '8px', borderLeft: '3px solid #f5a623' }
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

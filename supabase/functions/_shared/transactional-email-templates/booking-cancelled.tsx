import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { LogoHeader } from './logo-header.tsx'

const SITE_NAME = "Digital Launch CRM"

interface BookingCancelledProps {
  name?: string
  bookingDate?: string
  timeSlot?: string
  offerName?: string
  reason?: string
}

const BookingCancelledEmail = ({
  name,
  bookingDate,
  timeSlot,
  offerName,
  reason,
}: BookingCancelledProps) => (
  <Html lang="fr" dir="ltr">
    <Head />
    <Preview>Votre rendez-vous du {bookingDate} a été annulé</Preview>
    <Body style={main}>
      <Container style={container}>
        <LogoHeader />
        <Heading style={h1}>
          {name ? `${name}, votre rendez-vous a été annulé` : 'Votre rendez-vous a été annulé'}
        </Heading>

        <Text style={text}>
          Nous vous informons que votre rendez-vous{offerName ? ` pour « ${offerName} »` : ''} a été annulé.
        </Text>

        <Section style={detailsBox}>
          <Text style={detailLabel}>Créneau annulé</Text>
          <Text style={detailValue}>
            <s>{bookingDate || '—'} {timeSlot ? `à ${timeSlot}` : ''}</s>
          </Text>
        </Section>

        {reason && (
          <Text style={reasonText}>
            <strong>Motif :</strong> {reason}
          </Text>
        )}

        <Hr style={hr} />

        <Text style={text}>
          Si vous souhaitez reprogrammer, répondez simplement à cet email — nous vous proposerons un nouveau créneau qui vous convient.
        </Text>

        <Text style={footer}>
          Merci de votre compréhension,<br />
          L'équipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BookingCancelledEmail,
  subject: (data: Record<string, any>) =>
    `Annulation de votre RDV du ${data.bookingDate || ''}`,
  displayName: 'Annulation de rendez-vous',
  previewData: {
    name: 'Marie Dupont',
    bookingDate: '2026-04-01',
    timeSlot: '14:00',
    offerName: 'Consultation Stratégie',
    reason: 'Empêchement de dernière minute',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '520px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#1a1a2e', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#444', lineHeight: '1.6', margin: '0 0 16px' }
const detailsBox = {
  backgroundColor: '#fef2f2',
  borderRadius: '12px',
  padding: '20px 24px',
  margin: '20px 0',
  borderLeft: '4px solid #dc2626',
}
const detailLabel = { fontSize: '12px', color: '#dc2626', fontWeight: '600' as const, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const detailValue = { fontSize: '16px', color: '#1a1a2e', fontWeight: '600' as const, margin: '0' }
const reasonText = { fontSize: '14px', color: '#555', lineHeight: '1.5', margin: '10px 0 16px', padding: '10px 14px', backgroundColor: '#fff8e6', borderRadius: '8px', borderLeft: '3px solid #f5a623' }
const hr = { borderColor: '#e5e5e5', margin: '25px 0' }
const footer = { fontSize: '13px', color: '#999', margin: '20px 0 0', lineHeight: '1.5' }

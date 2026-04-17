/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Img, Section } from 'npm:@react-email/components@0.0.22'

export const LOGO_URL = 'https://rvangzupebrajhhhvewu.supabase.co/storage/v1/object/public/email-assets/logo.png'

export const LogoHeader = () => (
  <Section style={{ textAlign: 'center' as const, padding: '20px 0 10px' }}>
    <Img
      src={LOGO_URL}
      alt="Digital Launch"
      width="160"
      height="40"
      style={{ display: 'inline-block', maxWidth: '160px', height: 'auto' }}
    />
  </Section>
)

export default LogoHeader

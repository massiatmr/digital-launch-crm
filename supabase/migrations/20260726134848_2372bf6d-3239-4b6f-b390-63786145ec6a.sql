UPDATE public.push_subscriptions
SET status = 'inactive'
WHERE status = 'active'
  AND (
    endpoint IN (
      'onesignal:0886fb6e-45cc-4295-8fd3-9978c708ebd5',
      'onesignal:3fc7710a-edd0-4a31-bb6c-ecd07b6fa8b2',
      'onesignal:6811531c-6469-4777-ad42-6dac3621d911',
      'onesignal:6e4e6c50-9b92-4b63-97e6-e103f283fddd'
    )
    OR endpoint NOT LIKE 'onesignal:%'
  );
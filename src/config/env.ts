export const env = {
  port: Number(process.env.PORT ?? 3000),
  baseUrl: process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  callbackSecret: process.env.CALLBACK_SECRET ?? '',
};

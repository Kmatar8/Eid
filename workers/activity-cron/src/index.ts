export interface Env {
  SNAPSHOT_ENDPOINT: string;
  ADMIN_EMAIL: string;
  ADMIN_PASS: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const auth = btoa(`${env.ADMIN_EMAIL}:${env.ADMIN_PASS}`);
    await fetch(env.SNAPSHOT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`
      }
    });
  },
};

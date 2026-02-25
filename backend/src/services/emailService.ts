import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

export class EmailService {
  async sendMagicLink(email: string, magicLink: string): Promise<boolean> {
    try {
      await resend.emails.send({
        from: '2HJS Tracker <noreply@notifications.kongaiwen.dev>',
        to: email,
        subject: 'Your 2HJS Tracker login link',
        html: `
          <h2>Log in to 2HJS Tracker</h2>
          <p>Click the link below to log in:</p>
          <p><a href="${magicLink}">${magicLink}</a></p>
          <p>This link expires in 15 minutes.</p>
          <p><em>If you didn't request this, you can safely ignore this email.</em></p>
        `
      });
      return true;
    } catch (err) {
      console.error('Email error:', err);
      return false;
    }
  }
}

/**
 * About Page
 *
 * Information about the app, privacy, and legal disclaimers.
 */

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">About 2HJS Tracker</h1>

      <section className="prose prose-gray max-w-none mb-8">
        <p className="text-lg text-gray-600">
          This tool implements job search methodologies inspired by Steve Dalton's book
          &quot;The 2-Hour Job Search&quot; (Harvard Business Review Press).
        </p>
      </section>

      <section className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Privacy & Data</h2>
        <div className="space-y-3 text-gray-600">
          <p>
            <strong>End-to-End Encryption:</strong> All your job search data is encrypted
            on your device before being stored. We cannot read your employers, contacts,
            outreach history, or any other sensitive information.
          </p>
          <p>
            <strong>Authentication:</strong> We use Cloudflare Access with Google OAuth
            for authentication. Your email is stored only to identify your account and
            enable login.
          </p>
          <p>
            <strong>Usage Metrics:</strong> We track aggregate usage metrics (storage size,
            API call counts) to maintain service quality and prevent abuse. Individual
            data contents remain encrypted.
          </p>
          <p>
            <strong>Data Ownership:</strong> You maintain full ownership of your data.
            You can export your encrypted data at any time from the Settings page.
          </p>
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How It Works</h2>
        <div className="space-y-3 text-gray-600">
          <p>
            The 2HJS Tracker helps you implement the job search methodology from
            Steve Dalton's book, including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>LAMP Method:</strong> Employer prioritization using advocacy,
            motivation, posting quality, and personal fit</li>
            <li><strong>Contact Ranking:</strong> Identify and prioritize the most
            valuable contacts at target employers</li>
            <li><strong>Outreach Tracking:</strong> Track emails with built-in 3-business-day
            and 7-business-day follow-up reminders</li>
            <li><strong>Informational Interviews:</strong> Prepare and track your
            networking conversations</li>
            <li><strong>TIARA Framework:</strong> Generate questions using trends,
            insights, advice, resources, and assignments</li>
          </ul>
        </div>
      </section>

      <section className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-yellow-900 mb-4">Legal Notice</h2>
        <div className="text-yellow-800 space-y-3">
          <p>
            <strong>The 2-Hour Job Search</strong> and related concepts are the
            intellectual property of Steve Dalton.
          </p>
          <p>
            This application is an <strong>unofficial interpretation</strong> designed
            to help job seekers implement the methodology. It is not affiliated with,
            endorsed by, or sponsored by Steve Dalton, Harvard Business Review Press,
            or any associated parties.
          </p>
          <p>
            Please purchase the original book for a complete understanding of the
            methodology and to support the author's work.
          </p>
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Technology</h2>
        <div className="space-y-2 text-gray-600">
          <p><strong>Frontend:</strong> React + TypeScript + Vite</p>
          <p><strong>Backend:</strong> Cloudflare Workers + Hono</p>
          <p><strong>Database:</strong> Cloudflare D1 (SQLite)</p>
          <p><strong>Authentication:</strong> Cloudflare Access (Google SSO)</p>
          <p><strong>Encryption:</strong> Web Crypto API (RSA-OAEP)</p>
        </div>
      </section>

      <section className="mt-8 text-center text-sm text-gray-500">
        <p>
          Built with ❤️ for job seekers everywhere.
        </p>
        <p className="mt-2">
          <a href="https://github.com" className="text-blue-600 hover:underline">
            View on GitHub
          </a>
        </p>
      </section>
    </div>
  );
}

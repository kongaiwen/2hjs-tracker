import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, FileText } from 'lucide-react';
import api from '@/lib/api';

interface BulkData {
  employers?: Array<any>;
  contacts?: Array<any>;
  outreach?: Array<any>;
  informationals?: Array<any>;
  emailTemplates?: Array<any>;
  settings?: any;
}

export default function BulkUploadPage() {
  const [jsonData, setJsonData] = useState<BulkData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (data: BulkData) => {
      const response = await api.post('/api/bulk/import', data);
      return response.data;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['employers'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['outreach'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['informationals'] });

      const message = `Upload complete!\n\n` +
        `Employers: ${results.created.employers} created, ${results.updated.employers} updated\n` +
        `Contacts: ${results.created.contacts} created, ${results.updated.contacts} updated\n` +
        `Outreach: ${results.created.outreach} created, ${results.updated.outreach} updated\n` +
        `Informationals: ${results.created.informationals} created, ${results.updated.informationals} updated\n` +
        `Email Templates: ${results.created.emailTemplates} created, ${results.updated.emailTemplates} updated\n` +
        (results.errors.length ? `\nErrors: ${results.errors.length}` : '');

      alert(message);
      setJsonData(null);
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        setJsonData(data);
        setErrors([]);
      } catch (err) {
        setErrors(['Invalid JSON file']);
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = async () => {
    try {
      const data = await api.get('/api/bulk/export').then(r => r.data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `2hjs-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to export data');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk Upload / Export</h1>
        <p className="text-muted-foreground mt-1">
          Import or export your data in JSON format
        </p>
      </div>

      {/* Export Section */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Download className="w-5 h-5" />
          Export Current Data
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Download all your data as a JSON file. You can edit this file and re-upload it.
        </p>
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          Download Export
        </button>
      </div>

      {/* Upload Section */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Import Data
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Upload JSON File
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-violet-50 file:text-violet-700
                hover:file:bg-violet-100"
            />
          </div>

          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              {errors.map((err, i) => (
                <p key={i} className="text-sm text-red-800">{err}</p>
              ))}
            </div>
          )}

          {jsonData && (
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="font-medium mb-2">Preview:</h3>
              <ul className="text-sm space-y-1">
                <li>📁 {jsonData.employers?.length || 0} employers</li>
                <li>👥 {jsonData.contacts?.length || 0} contacts</li>
                <li>📧 {jsonData.outreach?.length || 0} outreach records</li>
                <li>📅 {jsonData.informationals?.length || 0} informational interviews</li>
                <li>📝 {jsonData.emailTemplates?.length || 0} email templates</li>
              </ul>
            </div>
          )}

          <button
            onClick={() => jsonData && uploadMutation.mutate(jsonData)}
            disabled={!jsonData || uploadMutation.isPending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Data'}
          </button>
        </div>
      </div>

      {/* Schema Reference */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          JSON Schema Reference
        </h2>
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
{`{
  "employers": [
    {
      "name": "Acme Corp",
      "advocacy": true,
      "motivation": 3,
      "posting": 2,
      "status": "ACTIVE",
      "industry": "Technology",
      "location": "San Francisco, CA",
      "website": "https://acme.com",
      "notes": "Dream company!",
      "isNetworkOrg": false
    }
  ],
  "contacts": [
    {
      "name": "Jane Doe",
      "employer": "Acme Corp",
      "title": "Engineering Manager",
      "email": "jane@acme.com",
      "linkedInUrl": "https://linkedin.com/in/jane",
      "phone": "+1-555-0123",
      "segment": "UNKNOWN",
      "priority": 1,
      "isFunctionallyRelevant": true,
      "isAlumni": false,
      "levelAboveTarget": 1,
      "contactMethod": "DIRECT_EMAIL_ALUMNI",
      "notes": "Met at conference"
    }
  ],
  "outreach": [
    {
      "contact": "Jane Doe",
      "employer": "Acme Corp",
      "subject": "Question about role",
      "body": "Hi Jane, ...",
      "sentAt": "2026-03-01T10:00:00Z",
      "threeB_Date": "2026-03-04T10:00:00Z",
      "sevenB_Date": "2026-03-10T10:00:00Z",
      "status": "AWAITING_3B",
      "calendarEventId": "event-id-123"
    }
  ],
  "informationals": [
    {
      "contact": "Jane Doe",
      "scheduledAt": "2026-03-15T14:00:00Z",
      "duration": 30,
      "method": "VIDEO",
      "outcome": "REFERRAL_OFFERED"
    }
  ],
  "emailTemplates": [
    {
      "name": "Initial Outreach",
      "type": "SIX_POINT_INITIAL",
      "subject": "Question about {{company}}",
      "body": "Hi {{name}},...",
      "variables": ["name", "company"]
    }
  ]
}`}
        </pre>
      </div>
    </div>
  );
}

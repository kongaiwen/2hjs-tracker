import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Edit2, Trash2, Copy, Sparkles } from 'lucide-react';
import { templatesApi } from '@/lib/api';
import { cn, countWords } from '@/lib/utils';
import type { EmailTemplate, TemplateType } from '@/types';

const templateTypeLabels: Record<TemplateType, string> = {
  SIX_POINT_INITIAL: '6-Point Email (With Connection)',
  SIX_POINT_NO_CONNECTION: '6-Point Email (No Connection)',
  SIX_POINT_WITH_POSTING: '6-Point Email (With Posting)',
  FOLLOW_UP_7B: '7B Follow-up',
  THANK_YOU: 'Thank You',
  REFERRAL_REQUEST: 'Referral Request',
};

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.getAll,
  });

  const seedMutation = useMutation({
    mutationFn: templatesApi.seed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setSelectedTemplate(null);
    },
  });

  // Group templates by type
  const groupedTemplates = templates?.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, EmailTemplate[]>);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage your 6-Point Email templates and follow-up messages
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-muted"
          >
            <Sparkles className="w-4 h-4" />
            {seedMutation.isPending ? 'Loading...' : 'Load Defaults'}
          </button>
          <button
            onClick={() => {
              setSelectedTemplate(null);
              setIsEditing(true);
            }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      {/* 6-Point Email Guidelines */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">6-Point Email Guidelines</h3>
        <ol className="text-sm text-blue-700 grid grid-cols-2 gap-2">
          <li>1. Write fewer than 75 words</li>
          <li>2. Ask for insight/advice, not job leads</li>
          <li>3. State your connection first</li>
          <li>4. Make request a question (ending in "?")</li>
          <li>5. Define interest narrowly AND broadly</li>
          <li>6. Keep &gt;50% about the contact</li>
        </ol>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Template List */}
        <div className="col-span-1 bg-card rounded-lg border border-border p-4">
          <h3 className="font-semibold mb-4">Templates</h3>

          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : !templates?.length ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">No templates yet</p>
              <button
                onClick={() => seedMutation.mutate()}
                className="text-primary hover:underline text-sm"
              >
                Load default templates
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedTemplates || {}).map(([type, temps]) => (
                <div key={type}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    {templateTypeLabels[type as TemplateType] || type}
                  </h4>
                  <ul className="space-y-1">
                    {temps.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => {
                            setSelectedTemplate(t);
                            setIsEditing(false);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                            selectedTemplate?.id === t.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{t.name}</span>
                            {t.isDefault && (
                              <span className="text-xs opacity-70">Default</span>
                            )}
                          </div>
                          <span
                            className={cn(
                              'text-xs',
                              selectedTemplate?.id === t.id
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground'
                            )}
                          >
                            {t.wordCount} words
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Preview/Editor */}
        <div className="col-span-2">
          {isEditing ? (
            <TemplateEditor
              template={selectedTemplate}
              onSave={() => {
                queryClient.invalidateQueries({ queryKey: ['templates'] });
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : selectedTemplate ? (
            <TemplatePreview
              template={selectedTemplate}
              onEdit={() => setIsEditing(true)}
              onDelete={() => {
                if (confirm('Delete this template?')) {
                  deleteMutation.mutate(selectedTemplate.id);
                }
              }}
            />
          ) : (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                Select a template to preview or edit
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplatePreview({
  template,
  onEdit,
  onDelete,
}: {
  template: EmailTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(template.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isWordCountOk = template.wordCount <= 75;

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold">{template.name}</h3>
          <p className="text-sm text-muted-foreground">
            {templateTypeLabels[template.type]}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="p-2 rounded-lg hover:bg-muted"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-muted" title="Edit">
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg hover:bg-destructive/10"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </div>

      {copied && (
        <div className="bg-green-100 text-green-800 text-sm px-4 py-2 rounded mb-4">
          Copied to clipboard!
        </div>
      )}

      <div className="mb-4">
        <label className="text-sm font-medium text-muted-foreground">Subject</label>
        <p className="font-mono bg-muted/50 rounded px-3 py-2 mt-1">{template.subject}</p>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Body</label>
          <span
            className={cn(
              'text-sm font-medium',
              isWordCountOk ? 'text-green-600' : 'text-red-600'
            )}
          >
            {template.wordCount} words {!isWordCountOk && '(over limit!)'}
          </span>
        </div>
        <pre className="font-mono text-sm bg-muted/50 rounded px-3 py-2 mt-1 whitespace-pre-wrap">
          {template.body}
        </pre>
      </div>

      {template.variables.length > 0 && (
        <div>
          <label className="text-sm font-medium text-muted-foreground">Variables</label>
          <div className="flex gap-2 mt-1">
            {template.variables.map((v) => (
              <span
                key={v}
                className="px-2 py-1 bg-primary/10 text-primary rounded text-sm font-mono"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: EmailTemplate | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [type, setType] = useState<TemplateType>(template?.type || 'SIX_POINT_INITIAL');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body || '');
  const [isDefault, setIsDefault] = useState(template?.isDefault || false);

  const createMutation = useMutation({
    mutationFn: templatesApi.create,
    onSuccess: onSave,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EmailTemplate> }) =>
      templatesApi.update(id, data),
    onSuccess: onSave,
  });

  const wordCount = countWords(body);
  const isWordCountOk = wordCount <= 75;

  const handleSubmit = () => {
    const data = { name, type, subject, body, isDefault };
    if (template) {
      updateMutation.mutate({ id: template.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-xl font-semibold mb-4">
        {template ? 'Edit Template' : 'New Template'}
      </h3>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              placeholder="Template name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TemplateType)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background"
            >
              {Object.entries(templateTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Subject *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background font-mono"
            placeholder="Your {{jobTitle}} experience at {{employerName}}"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use {`{{variable}}`} syntax for dynamic values
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Body *</label>
            <span
              className={cn(
                'text-sm font-medium',
                isWordCountOk ? 'text-green-600' : 'text-red-600'
              )}
            >
              {wordCount} / 75 words
            </span>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background font-mono text-sm"
            placeholder="Hi {{contactName}},..."
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Set as default for this type</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded-lg hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name || !subject || !body || isLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : template ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  );
}

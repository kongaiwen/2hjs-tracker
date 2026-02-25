import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Upload,
  Download,
  Check,
  X,
  Building2,
  Edit2,
  Trash2,
  GripVertical,
} from 'lucide-react';
import { employersApi } from '@/lib/api';
import { cn, getMotivationLabel, getPostingLabel } from '@/lib/utils';
import type { Employer, CreateEmployerInput } from '@/types';

type LAMPView = 'employers' | 'networks' | 'all';

export default function LAMPPage() {
  const queryClient = useQueryClient();
  const [lampView, setLampView] = useState<LAMPView>('employers');
  const [isAddingEmployer, setIsAddingEmployer] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Drag-and-drop state
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const { data: allEmployers, isLoading } = useQuery({
    queryKey: ['employers'],
    queryFn: employersApi.getAll,
  });

  const employers = allEmployers?.filter(e =>
    lampView === 'all' ? true
    : lampView === 'employers' ? !e.isNetworkOrg
    : e.isNetworkOrg
  );

  // Sync local order when server data or view changes (and not mid-drag)
  useEffect(() => {
    if (!isDraggingRef.current && employers) {
      setLocalOrder(employers.map(e => e.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEmployers, lampView]);

  // Derive displayed employers in drag-adjusted order
  const displayedEmployers = localOrder
    .map(id => employers?.find(e => e.id === id))
    .filter((e): e is Employer => e !== undefined);

  const createMutation = useMutation({
    mutationFn: employersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employers'] });
      setIsAddingEmployer(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateEmployerInput> }) =>
      employersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employers'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: employersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employers'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: employersApi.reorder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employers'] });
    },
  });

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
    isDraggingRef.current = true;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    const newOrder = [...localOrder];
    const [dragged] = newOrder.splice(dragIndexRef.current, 1);
    newOrder.splice(index, 0, dragged);
    dragIndexRef.current = index;
    setLocalOrder(newOrder);
  };

  const handleDrop = () => {
    isDraggingRef.current = false;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    reorderMutation.mutate(localOrder);
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LAMP List</h1>
          <p className="text-muted-foreground mt-1">
            Prioritize your target employers using the LAMP methodology
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddingEmployer(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            {lampView === 'networks' ? 'Add Network' : 'Add Employer'}
          </button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        {([
          ['employers', 'Employers'],
          ['networks', 'Networks & Affinity'],
          ['all', 'All'],
        ] as [LAMPView, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setLampView(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-r border-border last:border-r-0 transition-colors',
              lampView === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card hover:bg-muted'
            )}
          >
            {label}
            <span className={cn(
              'ml-1.5 px-1.5 py-0.5 rounded text-xs',
              lampView === key ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
            )}>
              {key === 'all' ? allEmployers?.length ?? 0
                : key === 'employers' ? allEmployers?.filter(e => !e.isNetworkOrg).length ?? 0
                : allEmployers?.filter(e => e.isNetworkOrg).length ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* LAMP Legend */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-semibold">L</span>ist: Target employers (40+)
          </div>
          <div>
            <span className="font-semibold">A</span>dvocacy: Alumni/connection (Y/N)
          </div>
          <div>
            <span className="font-semibold">M</span>otivation: Interest level (0-3)
          </div>
          <div>
            <span className="font-semibold">P</span>osting: Relevant jobs (1-3)
          </div>
        </div>
      </div>

      {/* Stats */}
      {lampView !== 'networks' && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{employers?.length || 0}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">With Advocacy</p>
            <p className="text-2xl font-bold">
              {employers?.filter((e) => e.advocacy).length || 0}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Dream Employers (M=3)</p>
            <p className="text-2xl font-bold">
              {employers?.filter((e) => e.motivation === 3).length || 0}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">With Postings (P≥2)</p>
            <p className="text-2xl font-bold">
              {employers?.filter((e) => e.posting >= 2).length || 0}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-4 font-semibold">#</th>
                <th className="text-left p-4 font-semibold">Employer</th>
                <th className="text-center p-4 font-semibold">A</th>
                <th className="text-center p-4 font-semibold">M</th>
                <th className="text-center p-4 font-semibold">P</th>
                <th className="text-left p-4 font-semibold">Industry</th>
                <th className="text-left p-4 font-semibold">Location</th>
                <th className="text-center p-4 font-semibold">Contacts</th>
                <th className="text-right p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isAddingEmployer && (
                <AddEmployerRow
                  defaultIsNetwork={lampView === 'networks'}
                  onSave={(data) => createMutation.mutate(data)}
                  onCancel={() => setIsAddingEmployer(false)}
                  isLoading={createMutation.isPending}
                />
              )}
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    Loading employers...
                  </td>
                </tr>
              ) : !displayedEmployers.length ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">No employers yet</p>
                    <p className="text-sm">
                      Start building your LAMP list by adding target employers
                    </p>
                  </td>
                </tr>
              ) : (
                displayedEmployers.map((employer, index) => (
                  <EmployerRow
                    key={employer.id}
                    employer={employer}
                    rank={index + 1}
                    isEditing={editingId === employer.id}
                    onEdit={() => setEditingId(employer.id)}
                    onSave={(data) =>
                      updateMutation.mutate({ id: employer.id, data })
                    }
                    onCancel={() => setEditingId(null)}
                    onDelete={() => {
                      if (confirm('Delete this employer?')) {
                        deleteMutation.mutate(employer.id);
                      }
                    }}
                    isLoading={updateMutation.isPending}
                    isDragOver={dragOverIndex === index}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface AddEmployerRowProps {
  defaultIsNetwork?: boolean;
  onSave: (data: CreateEmployerInput) => void;
  onCancel: () => void;
  isLoading: boolean;
}

function AddEmployerRow({ defaultIsNetwork = false, onSave, onCancel, isLoading }: AddEmployerRowProps) {
  const [data, setData] = useState<CreateEmployerInput>({
    name: '',
    advocacy: false,
    motivation: 0,
    posting: 1,
    industry: '',
    location: '',
    isNetworkOrg: defaultIsNetwork,
  });

  return (
    <tr className="bg-primary/5">
      <td className="p-4">-</td>
      <td className="p-4">
        <input
          type="text"
          value={data.name}
          onChange={(e) => setData({ ...data, name: e.target.value })}
          placeholder="Employer name"
          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
          autoFocus
        />
      </td>
      <td className="p-4 text-center">
        <button
          onClick={() => setData({ ...data, advocacy: !data.advocacy })}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            data.advocacy ? 'bg-green-500 text-white' : 'bg-muted'
          )}
        >
          {data.advocacy ? 'Y' : 'N'}
        </button>
      </td>
      <td className="p-4 text-center">
        <select
          value={data.motivation}
          onChange={(e) => setData({ ...data, motivation: parseInt(e.target.value) })}
          className="px-3 py-2 border border-border rounded-lg bg-background"
        >
          <option value={0}>0</option>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </td>
      <td className="p-4 text-center">
        <select
          value={data.posting}
          onChange={(e) => setData({ ...data, posting: parseInt(e.target.value) })}
          className="px-3 py-2 border border-border rounded-lg bg-background"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </td>
      <td className="p-4">
        <input
          type="text"
          value={data.industry || ''}
          onChange={(e) => setData({ ...data, industry: e.target.value })}
          placeholder="Industry"
          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
        />
      </td>
      <td className="p-4">
        <input
          type="text"
          value={data.location || ''}
          onChange={(e) => setData({ ...data, location: e.target.value })}
          placeholder="Location"
          className="w-full px-3 py-2 border border-border rounded-lg bg-background"
        />
      </td>
      <td className="p-4 text-center">-</td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => data.name && onSave(data)}
            disabled={!data.name || isLoading}
            className="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg bg-muted hover:bg-muted/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface EmployerRowProps {
  employer: Employer;
  rank: number;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (data: Partial<CreateEmployerInput>) => void;
  onCancel: () => void;
  onDelete: () => void;
  isLoading: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}

function EmployerRow({
  employer,
  rank,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  isLoading,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: EmployerRowProps) {
  const [data, setData] = useState({
    name: employer.name,
    advocacy: employer.advocacy,
    motivation: employer.motivation,
    posting: employer.posting,
    industry: employer.industry || '',
    location: employer.location || '',
  });

  if (isEditing) {
    return (
      <tr className="bg-primary/5">
        <td className="p-4">{rank}</td>
        <td className="p-4">
          <input
            type="text"
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background"
          />
        </td>
        <td className="p-4 text-center">
          <button
            onClick={() => setData({ ...data, advocacy: !data.advocacy })}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center',
              data.advocacy ? 'bg-green-500 text-white' : 'bg-muted'
            )}
          >
            {data.advocacy ? 'Y' : 'N'}
          </button>
        </td>
        <td className="p-4 text-center">
          <select
            value={data.motivation}
            onChange={(e) => setData({ ...data, motivation: parseInt(e.target.value) })}
            className="px-3 py-2 border border-border rounded-lg bg-background"
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </td>
        <td className="p-4 text-center">
          <select
            value={data.posting}
            onChange={(e) => setData({ ...data, posting: parseInt(e.target.value) })}
            className="px-3 py-2 border border-border rounded-lg bg-background"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </td>
        <td className="p-4">
          <input
            type="text"
            value={data.industry}
            onChange={(e) => setData({ ...data, industry: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background"
          />
        </td>
        <td className="p-4">
          <input
            type="text"
            value={data.location}
            onChange={(e) => setData({ ...data, location: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background"
          />
        </td>
        <td className="p-4 text-center">{employer._count?.contacts || 0}</td>
        <td className="p-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onSave(data)}
              disabled={isLoading}
              className="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={onCancel}
              className="p-2 rounded-lg bg-muted hover:bg-muted/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'border-b border-border hover:bg-muted/30 transition-colors',
        isDragOver ? 'bg-primary/10 border-primary/40' : ''
      )}
    >
      <td className="p-4">
        <div className="flex items-center gap-1.5">
          <GripVertical className="w-4 h-4 text-muted-foreground/40 cursor-grab active:cursor-grabbing shrink-0" />
          <span
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
              rank <= 5 ? 'bg-primary text-primary-foreground' : 'bg-muted'
            )}
          >
            {rank}
          </span>
        </div>
      </td>
      <td className="p-4 font-medium">
        <span>{employer.name}</span>
        {employer.isNetworkOrg && (
          <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700">Network</span>
        )}
      </td>
      <td className="p-4 text-center">
        <span
          className={cn(
            'inline-block w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center',
            employer.advocacy ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
          )}
        >
          {employer.advocacy ? 'Y' : 'N'}
        </span>
      </td>
      <td className="p-4 text-center">
        <span
          className={cn(
            'inline-block px-2 py-1 rounded text-sm font-medium',
            employer.motivation === 3
              ? 'bg-green-100 text-green-800'
              : employer.motivation === 2
              ? 'bg-yellow-100 text-yellow-800'
              : employer.motivation === 1
              ? 'bg-gray-100 text-gray-600'
              : 'bg-gray-50 text-gray-400'
          )}
          title={getMotivationLabel(employer.motivation)}
        >
          {employer.motivation}
        </span>
      </td>
      <td className="p-4 text-center">
        <span
          className={cn(
            'inline-block px-2 py-1 rounded text-sm font-medium',
            employer.posting === 3
              ? 'bg-green-100 text-green-800'
              : employer.posting === 2
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-gray-100 text-gray-600'
          )}
          title={getPostingLabel(employer.posting)}
        >
          {employer.posting}
        </span>
      </td>
      <td className="p-4 text-muted-foreground">{employer.industry || '-'}</td>
      <td className="p-4 text-muted-foreground">{employer.location || '-'}</td>
      <td className="p-4 text-center">{employer._count?.contacts || 0}</td>
      <td className="p-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-muted"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg hover:bg-destructive/10"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      </td>
    </tr>
  );
}

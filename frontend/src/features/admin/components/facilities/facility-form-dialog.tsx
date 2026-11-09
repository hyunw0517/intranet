"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import type { FacilityInput } from "@/services/api/facilities";
import type { Facility, FacilityCategory } from "@/types/reservation";

export type FacilityDialogState = { mode: "add"; categoryId: number } | { mode: "edit"; facility: Facility } | null;

interface FacilityFormDialogProps {
  state: FacilityDialogState;
  onClose: () => void;
  categories: FacilityCategory[];
  pending: boolean;
  error: unknown;
  onSubmit: (input: FacilityInput) => void;
}

// 시설 추가·수정 - 분류를 옮기면 새 예약부터 옮긴 분류의 규칙을 따른다. 사용 안 함이면 새 예약만 막는다.
export function FacilityFormDialog({ state, onClose, ...props }: FacilityFormDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !props.pending && onClose()}>
      <DialogContent className="sm:max-w-lg">{state && <FacilityForm state={state} onCancel={onClose} {...props} />}</DialogContent>
    </Dialog>
  );
}

function FacilityForm({
  state,
  categories,
  pending,
  error,
  onSubmit,
  onCancel,
}: Omit<FacilityFormDialogProps, "state" | "onClose"> & { state: NonNullable<FacilityDialogState>; onCancel: () => void }) {
  const editing = state.mode === "edit" ? state.facility : null;

  const [categoryId, setCategoryId] = useState(String(editing?.categoryId ?? (state.mode === "add" ? state.categoryId : "")));
  const [name, setName] = useState(editing?.name ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [capacity, setCapacity] = useState(editing?.capacity ? String(editing.capacity) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "시설명을 입력해 주세요.";
    else if (name.trim().length > 50) next.name = "시설명은 50자 이하로 입력해 주세요.";
    if (location.trim().length > 100) next.location = "위치는 100자 이하로 입력해 주세요.";
    const cap = capacity.trim() === "" ? null : Number(capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 10000)) next.capacity = "1~10000 사이 정수로 입력해 주세요.";
    if (description.trim().length > 500) next.description = "설명은 500자 이하로 입력해 주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      categoryId: Number(categoryId),
      name: name.trim(),
      location: location.trim() || null,
      capacity: cap,
      description: description.trim() || null,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "시설 수정" : "시설 추가"}</DialogTitle>
        <DialogDescription>예약 단위·운영 시간은 분류에서 정합니다.</DialogDescription>
      </DialogHeader>

      <FormError message={error ? getErrorMessage(error) : null} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="facility-category" label="분류" required>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="facility-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="facility-name" label="시설명" required error={errors.name}>
          <Input id="facility-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 대회의실" autoFocus autoComplete="off" aria-invalid={!!errors.name} aria-describedby="facility-name-message" />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="facility-location" label="위치" error={errors.location}>
          <Input id="facility-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 본관 3층" autoComplete="off" aria-invalid={!!errors.location} aria-describedby="facility-location-message" />
        </FormField>
        <FormField id="facility-capacity" label="최대 인원" error={errors.capacity}>
          <Input id="facility-capacity" type="number" inputMode="numeric" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} aria-invalid={!!errors.capacity} aria-describedby="facility-capacity-message" />
        </FormField>
      </div>

      <FormField id="facility-description" label="설명" error={errors.description}>
        <Textarea id="facility-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} aria-invalid={!!errors.description} aria-describedby="facility-description-message" />
      </FormField>

      <div className="flex items-start gap-2">
        <Checkbox id="facility-active" checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} className="mt-0.5" />
        <div className="grid gap-0.5">
          <Label htmlFor="facility-active">사용</Label>
          <p className="text-xs text-muted-foreground">끄면 새 예약을 받지 않습니다. 이미 있는 예약은 그대로 유지됩니다.</p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending || !categoryId}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}

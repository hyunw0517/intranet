import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

// 라벨 + 입력 + 오류/도움말을 묶는 공통 폼 필드
// 입력 요소에는 id와 aria-invalid, aria-describedby={`${id}-message`}를 넘겨 연결한다.
export function FormField({ id, label, required, error, hint, className, children }: FormFieldProps) {
  const message = error ?? hint;

  return (
    // content-start: 같은 줄의 다른 필드에만 도움말이 있을 때 라벨·입력 위치가 어긋나지 않게 위로 붙인다.
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {message && (
        <p id={`${id}-message`} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {message}
        </p>
      )}
    </div>
  );
}

// 폼 상단에 표시하는 서버 오류 메시지
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

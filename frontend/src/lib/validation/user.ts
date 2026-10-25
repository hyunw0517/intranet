// 백엔드 DTO(CreateUserDto, UpdateUserDto, ChangePasswordDto)와 같은 규칙으로 미리 검사한다.
// 최종 검증은 백엔드 ValidationPipe가 하고, 여기서는 사용자에게 빠르게 알려 주는 용도다.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string) {
  if (!value.trim()) return "이메일을 입력해 주세요.";
  if (!EMAIL_PATTERN.test(value.trim())) return "이메일 형식이 올바르지 않습니다.";
}

export function validateName(value: string) {
  if (!value.trim()) return "이름을 입력해 주세요.";
  if (value.trim().length > 30) return "이름은 30자 이하로 입력해 주세요.";
}

export function validateNickname(value: string) {
  if (value.trim().length > 20) return "닉네임은 20자 이하로 입력해 주세요.";
}

// 비밀번호 8~20자 (@Length(8, 20))
export function validateNewPassword(value: string) {
  if (!value) return "비밀번호를 입력해 주세요.";
  if (value.length < 8 || value.length > 20) return "비밀번호는 8~20자로 입력해 주세요.";
}

export function validatePasswordConfirm(password: string, confirm: string) {
  if (!confirm) return "비밀번호를 한 번 더 입력해 주세요.";
  if (password !== confirm) return "비밀번호가 일치하지 않습니다.";
}

// 전화번호는 숫자만 저장한다. 하이픈을 입력해도 제거 후 10~11자리인지 확인 (@Length(10, 11))
export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function validatePhone(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return; // 선택 항목
  if (digits.length < 10 || digits.length > 11) return "숫자 10~11자리로 입력해 주세요.";
}

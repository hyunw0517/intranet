//* auth 응답 (Swagger 문서용 클래스)

/** 토큰 발급 응답. refresh token은 본문이 아니라 HttpOnly 쿠키(Path=/api/auth)로 내려간다. */
export class AccessTokenResponse {
    /** access token (10분). 이후 요청의 Authorization: Bearer 에 넣는다. */
    accessToken: string;
}

/** 로그인된 기기 하나 */
export class AuthSessionResponse {
    /** 세션 id (uuid, 기기 로그아웃에 쓴다) */
    id: string;

    /** 로그인할 때의 User-Agent (기기 표시용) */
    userAgent: string | null;

    /** 로그인 시각 */
    createdAt: Date;

    /** 마지막 재발급 시각 (유휴 만료 판단) */
    lastUsedAt: Date;

    /** 절대 만료 시각 (재발급해도 늘어나지 않는다) */
    expiresAt: Date;

    /** 지금 요청한 기기인지 */
    current: boolean;
}

/** 회원가입 동의 화면 정보 */
export class ConsentInfoResponse {
    /** 개인정보처리자로 표시할 회사명 (서버 환경변수 COMPANY_NAME) */
    companyName: string;
}

/** (관리자) 비밀번호 초기화 결과 */
export class TemporaryPasswordResponse {
    /** 임시 비밀번호 (12자리). 응답으로 한 번만 돌려주고 DB에는 해시만 저장한다. */
    temporaryPassword: string;
}

/** (관리자) 로그인 잠금 해제 결과 */
export class UnlockLoginResponse {
    /** 로그인 실패 기록(실패 횟수·잠금 단계)을 지웠으면 true. 지울 기록이 없으면 false (오류 아님) */
    unlocked: boolean;
}

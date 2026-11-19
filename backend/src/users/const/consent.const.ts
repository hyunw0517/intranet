import { ConsentType } from 'src/generated/prisma/client';

//* 현재 시행 중인 동의 문서 버전
//  - 본문은 프론트(features/auth/consent-documents.ts)에 있다. 본문을 바꾸면 양쪽 버전을 함께 올린다.
//  - 가입 요청의 버전이 다르면 거부한다. (옛 화면을 보고 동의한 요청을 새 버전 동의로 기록하지 않기 위함)
export const CURRENT_CONSENT_VERSIONS: Record<ConsentType, string> = {
  [ConsentType.TERMS_OF_SERVICE]: '1.0',
  [ConsentType.PRIVACY_COLLECTION]: '1.1', // 1.1(2026-11-19): 선택 항목에 프로필 사진 추가
};

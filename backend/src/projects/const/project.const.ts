//* 과제 관리 알림 이동 주소 (프론트 경로, docs/design/projects.md)
export const projectLink = ( projectId: number ) => `/projects/${projectId}`;
export const projectTaskLink = ( projectId: number, taskId: number ) => `/projects/${projectId}?task=${taskId}`;

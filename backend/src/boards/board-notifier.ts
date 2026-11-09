import { Injectable, Logger } from "@nestjs/common";
import { NotificationActionType, NotificationTargetType, Post } from "src/generated/prisma/client";
import { NotificationsService } from "src/common/notifications.service";
import { bestEffort } from "src/common/util/best-effort.util";
import { BoardAuthService } from "./board-auth.service";

// 알림 내용에 넣는 댓글 미리보기 길이
const COMMENT_PREVIEW_LENGTH = 50;

const postLink = ( boardId: number, postId: number ) => `/boards/${boardId}/posts/${postId}`;
const preview = ( comment: string ) =>
    comment.length > COMMENT_PREVIEW_LENGTH ? `${comment.slice(0, COMMENT_PREVIEW_LENGTH)}…` : comment;

//! 게시판 알림 규칙 (누구에게 · 어떤 내용으로 보내는지를 한곳에 모은다)
// - 게시글·댓글 서비스는 업무 트랜잭션이 **커밋된 뒤** 이 클래스를 한 줄 호출한다. (2026-11-09 사용자 결정)
//   알림은 빠져도 불편에 그치므로, 실패해도 업무를 막지 않는다(bestEffort - 서버 로그만 남김).
//   커밋 뒤에 보내므로 롤백된 작업에 알림이 가는 일은 없다.
// - 실제 저장은 공통 NotificationsService. 여기서는 받는 사람·문구·이동 주소만 정한다.
// - 익명 게시판은 발신자를 남기지 않는다(알림 목록이 발신자 이름을 함께 보여 주므로).
//   send()의 "발신자 제외"는 senderId 기준이라, 발신자를 비울 때는 작성자 제외를 여기서 먼저 한다.
@Injectable()
export class BoardNotifier {

    private readonly logger = new Logger( BoardNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly boardAuthService: BoardAuthService,
    ){}

    //* 새 댓글 (2026-11-09 사용자 결정)
    // - 대댓글: 부모 댓글 작성자에게 COMMENT_REPLIED
    // - 글 작성자에게 POST_COMMENTED (대댓글도 그 글의 댓글이므로 포함). 부모 댓글 작성자와 같은 사람이면 답글 알림만 보낸다.
    // - 본인 글·본인 댓글에 직접 단 경우는 보내지 않는다.
    newComment( params: {
        boardId: number;
        post: Pick<Post, 'id' | 'title' | 'authorId'>;
        isAnonymous: boolean;
        parentAuthorId: number | null;
        commentId: number;
        comment: string;
        writerId: number;
    }){
        return bestEffort( this.logger, `댓글 알림(comment ${params.commentId})`, async () => {
            const { boardId, post, isAnonymous, parentAuthorId, commentId, comment, writerId } = params;

            const common = {
                targetType: NotificationTargetType.COMMENT,
                targetId: commentId,
                content: `[${post.title}] ${ preview( comment ) }`,
                link: postLink( boardId, post.id ),
                senderId: isAnonymous ? null : writerId,
            };

            const replyTo = ( parentAuthorId !== null && parentAuthorId !== writerId ) ? parentAuthorId : null;
            const postAuthor = ( post.authorId !== writerId && post.authorId !== replyTo ) ? post.authorId : null;

            if( replyTo !== null ){
                await this.notificationsService.send({
                    ...common,
                    userIds: [ replyTo ],
                    actionType: NotificationActionType.COMMENT_REPLIED,
                    title: '내 댓글에 답글이 달렸습니다.',
                });
            }

            if( postAuthor !== null ){
                await this.notificationsService.send({
                    ...common,
                    userIds: [ postAuthor ],
                    actionType: NotificationActionType.POST_COMMENTED,
                    title: '내 글에 댓글이 달렸습니다.',
                });
            }
        });
    }

    //* 공지 게시판 새 글 → 그 게시판을 읽을 수 있는 회원 (작성자 제외)
    // - 비밀글은 작성자·관리자만 볼 수 있으므로 보내지 않는다. 수정 시에는 다시 보내지 않는다. (호출하는 쪽에서 작성 시에만 호출)
    // - 고정 여부와는 무관하다. (2026-11-09 사용자 결정으로 유지)
    noticeCreated( params: {
        board: { id: number; name: string; isAnonymous: boolean };
        post: Pick<Post, 'id' | 'title' | 'isSecret'>;
        writerId: number;
    }){
        return bestEffort( this.logger, `공지 알림(post ${params.post.id})`, async () => {
            const { board, post, writerId } = params;

            if( post.isSecret ){
                return;
            }

            const readers = await this.boardAuthService.findReadableUserIds( board.id );

            await this.notificationsService.send({
                userIds: readers.filter( ( id ) => id !== writerId ),
                actionType: NotificationActionType.NOTICE_CREATED,
                targetType: NotificationTargetType.POST,
                targetId: post.id,
                title: '새 공지사항이 등록되었습니다.',
                content: `[${board.name}] ${post.title}`,
                link: postLink( board.id, post.id ),
                senderId: board.isAnonymous ? null : writerId,
            });
        });
    }

    //* 관리 권한으로 남의 글 삭제 → 글 작성자 (본인 삭제면 보내지 않음)
    // - 삭제한 관리자 개인은 드러내지 않는다(발신자 NULL, 누가 지웠는지는 감사 로그에 남음).
    // - 글이 없어졌으므로 게시판 목록으로 이동한다.
    postDeletedByAdmin( params: {
        board: { id: number; name: string };
        post: Pick<Post, 'id' | 'title' | 'authorId'>;
        deleterId: number;
    }){
        return bestEffort( this.logger, `글 삭제 알림(post ${params.post.id})`, async () => {
            const { board, post, deleterId } = params;

            if( post.authorId === deleterId ){
                return;
            }

            await this.notificationsService.send({
                userIds: [ post.authorId ],
                actionType: NotificationActionType.POST_DELETED_BY_ADMIN,
                targetType: NotificationTargetType.POST,
                targetId: post.id,
                title: '관리자가 내 글을 삭제했습니다.',
                content: `[${board.name}] ${post.title}`,
                link: `/boards/${board.id}`,
                senderId: null,
            });
        });
    }

    //* 관리 권한으로 남의 댓글 삭제 → 댓글 작성자 (본인 삭제면 보내지 않음)
    commentDeletedByAdmin( params: {
        boardId: number;
        post: Pick<Post, 'id' | 'title'>;
        comment: { id: number; authorId: number; comment: string };
        deleterId: number;
    }){
        return bestEffort( this.logger, `댓글 삭제 알림(comment ${params.comment.id})`, async () => {
            const { boardId, post, comment, deleterId } = params;

            if( comment.authorId === deleterId ){
                return;
            }

            await this.notificationsService.send({
                userIds: [ comment.authorId ],
                actionType: NotificationActionType.COMMENT_DELETED_BY_ADMIN,
                targetType: NotificationTargetType.COMMENT,
                targetId: comment.id,
                title: '관리자가 내 댓글을 삭제했습니다.',
                content: `[${post.title}] ${ preview( comment.comment ) }`,
                link: postLink( boardId, post.id ),
                senderId: null,
            });
        });
    }
}

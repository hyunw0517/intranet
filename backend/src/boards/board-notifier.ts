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

//! 게시판 알림 (댓글·공지·관리자 삭제)
// 서비스가 커밋 후 호출하고, 알림이 실패해도 업무는 성공으로 둔다(bestEffort).
// 익명 게시판은 발신자를 비운다. send()의 발신자 제외가 senderId 기준이라 작성자 제외는 여기서 한다.
@Injectable()
export class BoardNotifier {

    private readonly logger = new Logger( BoardNotifier.name );

    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly boardAuthService: BoardAuthService,
    ){}

    //* 새 댓글
    // 대댓글이면 부모 댓글 작성자에게 답글 알림, 글 작성자에게는 댓글 알림을 보낸다.
    // 둘이 같은 사람이면 답글 알림만, 본인 글·댓글에 단 경우는 보내지 않는다.
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

    //* 공지 게시판 새 글 알림 (읽을 수 있는 회원, 작성자 제외)
    // 비밀글은 보내지 않는다. 작성할 때만 호출한다.
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

    //* 관리 권한으로 남의 글 삭제 알림 (글 작성자에게)
    // 지운 관리자는 드러내지 않는다(발신자 NULL, 감사 로그에는 남음). 글이 없으니 게시판 목록으로 보낸다.
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

    //* 관리 권한으로 남의 댓글 삭제 알림 (댓글 작성자에게)
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

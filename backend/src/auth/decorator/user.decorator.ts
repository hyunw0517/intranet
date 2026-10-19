import { createParamDecorator, ExecutionContext, InternalServerErrorException } from "@nestjs/common";
import { Users } from "src/generated/prisma/client";

export const User = createParamDecorator((data: keyof Users | undefined, context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest();

    const user = req.user as Users;

    if(!user){
        throw new InternalServerErrorException('User 데코레이터는 AccessTokenGuard와 함께 사용해야 합니다.');
    }

    if(data){
        return user[data];
    }

    return user;
});
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
//import { ENV_HOST_KEY, ENV_PROTOCOL_KEY } from './const/env-keys.const';

@Injectable()
export class CommonService {
    constructor(
        private readonly configService: ConfigService, 
    ){}

}


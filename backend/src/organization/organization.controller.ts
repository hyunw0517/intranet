import { Controller, Get } from '@nestjs/common';
import { OrganizationService } from './organization.service';

// 소속 집계 컨트롤러 -> 부서(departments) + 직급(positions) + 직책(job-titles) 
@Controller('organization')
export class OrganizationController {

  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  getAll(){

  }
}

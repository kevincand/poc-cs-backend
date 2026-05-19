import { Body, Controller, Post } from '@nestjs/common';

import { LoginDto } from './dto/login.dto';
import { NiraService } from './nira.service';

@Controller('auth')
export class NiraController {
  constructor(private readonly niraService: NiraService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.niraService.login(body.email!, body.senha!);
  }
}
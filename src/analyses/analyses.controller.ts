import {
    Controller,
    Get,
    Headers,
    Query,
} from '@nestjs/common';

import {
    Body,
    ForbiddenException,
    Param,
    Patch,
} from '@nestjs/common';


import { AnalysesService } from './analyses.service';

import { NiraService } from '@/integrations/nira/nira.service';

import {
    AnalysisStatus,
    UpdateStatusDto,
} from './dto/update-status.dto';

@Controller('analyses')
export class AnalysesController {
    constructor(
        private readonly analysesService: AnalysesService,
        private readonly niraService: NiraService,
    ) { }

    @Get()
    async findAll(
        @Headers('authorization') auth: string,
        @Query() query: Record<string, any>,
    ) {
        const token = auth?.replace('Bearer ', '');

        return this.analysesService.findAll(token, query);
    }

    @Patch(':uuid/status')
    async updateStatus(
        @Param('uuid') uuid: string,

        @Body() body: UpdateStatusDto,

        @Headers('x-user-role') role: string,

        @Headers('authorization') auth: string,
    ) {
        const token = auth?.replace('Bearer ', '');

        if (!token) {
            throw new ForbiddenException('Token inválido');
        }

        if (role !== 'ADMIN') {
            throw new ForbiddenException(
                'Usuário sem permissão',
            );
        }

        return this.analysesService.updateStatus(
            uuid,
            body.status,
        );
    }

    @Get(':uuid/spectrum')
    getSpectrum(
        @Param('uuid') uuid: string,
        @Headers('authorization') auth: string,
    ) {
        const token = auth?.replace('Bearer ', '');
        
        return this.niraService.getSpectro(token, uuid);
    }
}
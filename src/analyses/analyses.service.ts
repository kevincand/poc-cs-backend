import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';

import { NiraService } from '@/integrations/nira/nira.service';

import { extractSampleGroup } from '@/common/utils/extract-sample-group';
import { AnalysisStatus } from './dto/update-status.dto';

@Injectable()
export class AnalysesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly niraService: NiraService,
    ) { }

    async findAll(token: string, query: any) {
        const response = await this.niraService.getAnalyses(token, query);

        const analyses = response.content;

        const uuids = analyses.map((item: any) => item.uuid);

        const statuses = await this.prisma.analysisStatusControl.findMany({
            where: {
                analysisUuid: {
                    in: uuids,
                },
            },
        });

        const statusMap = new Map(
            statuses.map((status) => [status.analysisUuid, status]),
        );

        const normalized = analyses.map((item: any) => {
            const resultados =
                item.resultadosFinais?.[0]?.resultados || [];

            const getResult = (name: string) => {
                return (
                    resultados.find((r: any) => r.nome === name)?.valor || 0
                );
            };

            const proteina = getResult('Proteína');

            const umidade = getResult('Umidade');

            const hasAlert =
                proteina < 45 ||
                proteina > 47 ||
                umidade > 12.5;

            return {
                uuid: item.uuid,

                nome: item.nome,

                sampleGroup: extractSampleGroup(item.nome),

                grao: item.grao,

                usuario: item.criadoPor?.nome,

                dataHora: item.criadoEm,

                dispositivo: item.nirNumSerie,

                proteina,

                oleo: getResult('Óleo'),

                umidade,

                cinzas: getResult('Cinzas'),

                fibra: getResult('Fibra'),

                densidade: getResult('Densidade'),

                status:
                    statusMap.get(item.uuid)?.status || 'PENDENTE',

                hasAlert,
            };
        });

        return {
            ...response,
            content: normalized,
        };
    }
    async updateStatus(
        uuid: string,
        status?: AnalysisStatus,
    ) {
        if (status === undefined) {
            throw new Error('status is required');
        }
        return this.prisma.analysisStatusControl.upsert({
            where: {
                analysisUuid: uuid,
            },

            update: {
                status,
            },

            create: {
                analysisUuid: uuid,
                status,
            },
        });
    }
}
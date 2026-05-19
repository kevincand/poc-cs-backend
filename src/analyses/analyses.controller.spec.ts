import { Test, TestingModule } from '@nestjs/testing';
import { AnalysesController } from './analyses.controller';

describe('AnalysesController', () => {
  let controller: AnalysesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysesController],
    }).compile();

    controller = module.get<AnalysesController>(AnalysesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NiraController } from './nira.controller';

describe('NiraController', () => {
  let controller: NiraController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NiraController],
    }).compile();

    controller = module.get<NiraController>(NiraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

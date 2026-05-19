import { Test, TestingModule } from '@nestjs/testing';
import { NiraService } from './nira.service';

describe('NiraService', () => {
  let service: NiraService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NiraService],
    }).compile();

    service = module.get<NiraService>(NiraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

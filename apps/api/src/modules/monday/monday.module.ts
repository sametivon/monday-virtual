import { Module } from '@nestjs/common';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AuthModule } from '../auth/auth.module';
import { MondayController } from './monday.controller';
import { MondayService } from './monday.service';

@Module({
  imports: [AuthModule],
  controllers: [MondayController],
  providers: [MondayService, CryptoService],
})
export class MondayModule {}

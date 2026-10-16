import {
  TurboModuleRegistry,
  type CodegenTypes,
  type TurboModule,
} from 'react-native';

export interface Spec extends TurboModule {
  prepare(): Promise<void>;
  initialize(
    config: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  startDetection(
    options: CodegenTypes.UnsafeObject
  ): Promise<CodegenTypes.UnsafeObject>;
  getCapabilities(): Promise<CodegenTypes.UnsafeObject>;
  getSdkVersion(): Promise<CodegenTypes.UnsafeObject>;
  getDiagnosticInfo(): Promise<CodegenTypes.UnsafeObject>;
  clearDiagnosticInfo(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('EsandLiveness');

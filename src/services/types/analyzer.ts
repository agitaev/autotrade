export interface AnalysisResult {
	success: boolean;
	duration: number;
	metrics?: any;
	recommendations?: any[];
	error?: string;
	step?: string;
}

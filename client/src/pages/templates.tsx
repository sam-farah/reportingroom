import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Settings, Trash2, FileText, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { ReportTemplate, InsertReportTemplate } from "@shared/schema";

interface TemplateFormData {
  name: string;
  description: string;
  templateType: 'pdf' | 'docx' | 'both';
  
  // Header configuration
  showHeader: boolean;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  showLogo: boolean;
  
  // Patient info configuration
  patientInfoLayout: 'grid' | 'list' | 'compact';
  showPatientId: boolean;
  
  // Content sections
  showStudyType: boolean;
  showIndication: boolean;
  showFindings: boolean;
  showImpression: boolean;
  
  // Footer configuration
  showFooter: boolean;
  footerText: string;
  showReportId: boolean;
  showGenerationDate: boolean;
  
  // Physician signature
  showSignature: boolean;
  signaturePosition: 'left' | 'right' | 'center';
  
  // Styling options
  primaryColor: string;
  fontFamily: string;
  fontSize: string;
  
  isDefault: boolean;
}

const defaultFormData: TemplateFormData = {
  name: "",
  description: "",
  templateType: 'both',
  showHeader: true,
  clinicName: "",
  clinicAddress: "",
  clinicPhone: "",
  showLogo: true,
  patientInfoLayout: 'grid',
  showPatientId: false,
  showStudyType: true,
  showIndication: true,
  showFindings: true,
  showImpression: true,
  showFooter: true,
  footerText: "",
  showReportId: true,
  showGenerationDate: true,
  showSignature: true,
  signaturePosition: 'right',
  primaryColor: '#0066cc',
  fontFamily: 'Arial',
  fontSize: '12px',
  isDefault: false,
};

export default function Templates() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(defaultFormData);

  // Fetch all templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/templates"],
    retry: false,
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (templateData: InsertReportTemplate) => {
      return await apiRequest("/api/templates", {
        method: "POST",
        body: JSON.stringify(templateData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Template Created",
        description: "Your report template has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create template",
        variant: "destructive",
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, templateData }: { id: number; templateData: Partial<InsertReportTemplate> }) => {
      return await apiRequest(`/api/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(templateData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Template Updated",
        description: "Your report template has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      setFormData(defaultFormData);
    },
    onError: (error: Error) => {
      console.error("Template update mutation error:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update template",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/templates/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Template Deleted",
        description: "Template has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleEditTemplate = (template: ReportTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      templateType: template.templateType as 'pdf' | 'docx' | 'both',
      showHeader: template.showHeader,
      clinicName: template.clinicName || "",
      clinicAddress: template.clinicAddress || "",
      clinicPhone: template.clinicPhone || "",
      showLogo: template.showLogo,
      patientInfoLayout: template.patientInfoLayout as 'grid' | 'list' | 'compact',
      showPatientId: template.showPatientId,
      showStudyType: template.showStudyType,
      showIndication: template.showIndication,
      showFindings: template.showFindings,
      showImpression: template.showImpression,
      showFooter: template.showFooter,
      footerText: template.footerText || "",
      showReportId: template.showReportId,
      showGenerationDate: template.showGenerationDate,
      showSignature: template.showSignature,
      signaturePosition: template.signaturePosition as 'left' | 'right' | 'center',
      primaryColor: template.primaryColor,
      fontFamily: template.fontFamily,
      fontSize: template.fontSize,
      isDefault: template.isDefault,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteTemplate = (id: number) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplateMutation.mutate(id);
    }
  };

  const handleSaveTemplate = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required",
        variant: "destructive",
      });
      return;
    }

    // Clean the form data and convert to the right types
    const templateData: InsertReportTemplate = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      templateType: formData.templateType,
      showHeader: formData.showHeader,
      clinicName: formData.clinicName.trim() || undefined,
      clinicAddress: formData.clinicAddress.trim() || undefined,
      clinicPhone: formData.clinicPhone.trim() || undefined,
      showLogo: formData.showLogo,
      patientInfoLayout: formData.patientInfoLayout,
      showPatientId: formData.showPatientId,
      showStudyType: formData.showStudyType,
      showIndication: formData.showIndication,
      showFindings: formData.showFindings,
      showImpression: formData.showImpression,
      showFooter: formData.showFooter,
      footerText: formData.footerText.trim() || undefined,
      showReportId: formData.showReportId,
      showGenerationDate: formData.showGenerationDate,
      showSignature: formData.showSignature,
      signaturePosition: formData.signaturePosition,
      primaryColor: formData.primaryColor,
      fontFamily: formData.fontFamily,
      fontSize: formData.fontSize,
      isDefault: formData.isDefault,
    };

    console.log("Saving template data:", templateData);

    if (editingTemplate) {
      console.log("Updating template with ID:", editingTemplate.id);
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        templateData,
      });
    } else {
      console.log("Creating new template");
      createTemplateMutation.mutate(templateData);
    }
  };

  const updateFormData = (field: keyof TemplateFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading templates...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report Templates</h1>
          <p className="text-gray-600 mt-1">Create and manage custom report layouts for PDF and DOCX exports</p>
        </div>
        <Button onClick={handleCreateTemplate} className="medical-btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template: ReportTemplate) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-blue-600" />
                  {template.name}
                  {template.isDefault && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      Default
                    </span>
                  )}
                </CardTitle>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditTemplate(template)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-3">
                {template.description || "No description provided"}
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Format:</span>
                  <span className="font-medium uppercase">{template.templateType}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Layout:</span>
                  <span className="font-medium capitalize">{template.patientInfoLayout}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Color:</span>
                  <div className="flex items-center">
                    <div 
                      className="w-4 h-4 rounded border mr-1" 
                      style={{ backgroundColor: template.primaryColor }}
                    ></div>
                    <span className="font-medium">{template.primaryColor}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {templates.length === 0 && (
          <div className="col-span-full text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Templates Yet</h3>
            <p className="text-gray-600 mb-4">Create your first report template to customize how your reports look</p>
            <Button onClick={handleCreateTemplate} className="medical-btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              Create First Template
            </Button>
          </div>
        )}
      </div>

      {/* Template Editor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create New Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  placeholder="e.g., Professional Report Layout"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateFormData('description', e.target.value)}
                  placeholder="Brief description of this template..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="templateType">Output Format</Label>
                <Select
                  value={formData.templateType}
                  onValueChange={(value) => updateFormData('templateType', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF Only</SelectItem>
                    <SelectItem value="docx">DOCX Only</SelectItem>
                    <SelectItem value="both">Both PDF & DOCX</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => updateFormData('isDefault', checked)}
                />
                <Label htmlFor="isDefault">Set as default template</Label>
              </div>
            </div>

            {/* Header Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Header Settings</h3>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="showHeader"
                  checked={formData.showHeader}
                  onCheckedChange={(checked) => updateFormData('showHeader', checked)}
                />
                <Label htmlFor="showHeader">Show header section</Label>
              </div>

              {formData.showHeader && (
                <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                  <div className="space-y-2">
                    <Label htmlFor="clinicName">Clinic Name</Label>
                    <Input
                      id="clinicName"
                      value={formData.clinicName}
                      onChange={(e) => updateFormData('clinicName', e.target.value)}
                      placeholder="Your Clinic Name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clinicAddress">Clinic Address</Label>
                    <Textarea
                      id="clinicAddress"
                      value={formData.clinicAddress}
                      onChange={(e) => updateFormData('clinicAddress', e.target.value)}
                      placeholder="123 Medical Center Drive..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clinicPhone">Phone Number</Label>
                    <Input
                      id="clinicPhone"
                      value={formData.clinicPhone}
                      onChange={(e) => updateFormData('clinicPhone', e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="showLogo"
                      checked={formData.showLogo}
                      onCheckedChange={(checked) => updateFormData('showLogo', checked)}
                    />
                    <Label htmlFor="showLogo">Show clinic logo</Label>
                  </div>
                </div>
              )}
            </div>

            {/* Content Sections */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Content Sections</h3>
              
              <div className="space-y-2">
                <Label htmlFor="patientInfoLayout">Patient Info Layout</Label>
                <Select
                  value={formData.patientInfoLayout}
                  onValueChange={(value) => updateFormData('patientInfoLayout', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Grid Layout</SelectItem>
                    <SelectItem value="list">List Layout</SelectItem>
                    <SelectItem value="compact">Compact Layout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="showStudyType"
                    checked={formData.showStudyType}
                    onCheckedChange={(checked) => updateFormData('showStudyType', checked)}
                  />
                  <Label htmlFor="showStudyType" className="text-sm">Study Type</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="showIndication"
                    checked={formData.showIndication}
                    onCheckedChange={(checked) => updateFormData('showIndication', checked)}
                  />
                  <Label htmlFor="showIndication" className="text-sm">Indication</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="showFindings"
                    checked={formData.showFindings}
                    onCheckedChange={(checked) => updateFormData('showFindings', checked)}
                  />
                  <Label htmlFor="showFindings" className="text-sm">Findings</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="showImpression"
                    checked={formData.showImpression}
                    onCheckedChange={(checked) => updateFormData('showImpression', checked)}
                  />
                  <Label htmlFor="showImpression" className="text-sm">Impression</Label>
                </div>
              </div>
            </div>

            {/* Styling Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Styling</h3>
              
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    id="primaryColor"
                    value={formData.primaryColor}
                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                    className="w-12 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={formData.primaryColor}
                    onChange={(e) => updateFormData('primaryColor', e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fontFamily">Font Family</Label>
                  <Select
                    value={formData.fontFamily}
                    onValueChange={(value) => updateFormData('fontFamily', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arial">Arial</SelectItem>
                      <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                      <SelectItem value="Helvetica">Helvetica</SelectItem>
                      <SelectItem value="Calibri">Calibri</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fontSize">Font Size</Label>
                  <Select
                    value={formData.fontSize}
                    onValueChange={(value) => updateFormData('fontSize', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10px">10px</SelectItem>
                      <SelectItem value="11px">11px</SelectItem>
                      <SelectItem value="12px">12px</SelectItem>
                      <SelectItem value="14px">14px</SelectItem>
                      <SelectItem value="16px">16px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signaturePosition">Signature Position</Label>
                <Select
                  value={formData.signaturePosition}
                  onValueChange={(value) => updateFormData('signaturePosition', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Footer Configuration */}
            <div className="space-y-4 md:col-span-2">
              <h3 className="text-lg font-semibold">Footer Settings</h3>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="showFooter"
                  checked={formData.showFooter}
                  onCheckedChange={(checked) => updateFormData('showFooter', checked)}
                />
                <Label htmlFor="showFooter">Show footer section</Label>
              </div>

              {formData.showFooter && (
                <div className="pl-4 border-l-2 border-gray-200 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="footerText">Footer Text</Label>
                    <Textarea
                      id="footerText"
                      value={formData.footerText}
                      onChange={(e) => updateFormData('footerText', e.target.value)}
                      placeholder="Custom footer text..."
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showReportId"
                        checked={formData.showReportId}
                        onCheckedChange={(checked) => updateFormData('showReportId', checked)}
                      />
                      <Label htmlFor="showReportId" className="text-sm">Show Report ID</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showGenerationDate"
                        checked={formData.showGenerationDate}
                        onCheckedChange={(checked) => updateFormData('showGenerationDate', checked)}
                      />
                      <Label htmlFor="showGenerationDate" className="text-sm">Show Generation Date</Label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              className="medical-btn-primary"
            >
              {createTemplateMutation.isPending || updateTemplateMutation.isPending
                ? "Saving..."
                : editingTemplate
                ? "Update Template"
                : "Create Template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
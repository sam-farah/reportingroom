import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import type { Physician, InsertPhysician } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Trash2, Edit, Users, Upload, Pen, X, RotateCcw } from "lucide-react";

export default function Physicians() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPhysician, setEditingPhysician] = useState<Physician | null>(null);
  const [newPhysician, setNewPhysician] = useState<InsertPhysician>({
    name: "",
    title: "",
    specialty: "",
  });
  const [signatureMode, setSignatureMode] = useState<"upload" | "draw">("upload");
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Set up canvas drawing properties
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Fetch physicians
  const { data: physicians = [], isLoading: physiciansLoading, error: physiciansError } = useQuery({
    queryKey: ["/api/physicians"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Add physician mutation
  const addPhysicianMutation = useMutation({
    mutationFn: async (physician: InsertPhysician) => {
      return await apiRequest("POST", "/api/physicians", physician);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setIsAddDialogOpen(false);
      setNewPhysician({ name: "", title: "", specialty: "" });
      setSignatureFile(null);
      clearCanvas();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast({
        title: "Success",
        description: "Physician added successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to add physician",
        variant: "destructive",
      });
    },
  });

  // Update physician mutation
  const updatePhysicianMutation = useMutation({
    mutationFn: async (physician: Physician) => {
      const { id, ...updateData } = physician;
      return await apiRequest("PATCH", `/api/physicians/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      setEditingPhysician(null);
      setSignatureFile(null);
      clearCanvas();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast({
        title: "Success",
        description: "Physician updated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update physician",
        variant: "destructive",
      });
    },
  });

  const handleUpdatePhysician = async () => {
    if (!editingPhysician) return;
    
    try {
      let signatureUrl = editingPhysician.signatureUrl;

      // Handle signature updates if a new one is provided
      if (signatureMode === "upload" && signatureFile) {
        const formData = new FormData();
        formData.append('signature', signatureFile);
        
        const uploadResponse = await fetch('/api/upload-signature', {
          method: 'POST',
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const { url } = await uploadResponse.json();
          signatureUrl = url;
        }
      } else if (signatureMode === "draw") {
        const blob = await getCanvasBlob();
        if (blob) {
          const formData = new FormData();
          formData.append('signature', blob, 'signature.png');
          
          const uploadResponse = await fetch('/api/upload-signature', {
            method: 'POST',
            body: formData,
          });
          
          if (uploadResponse.ok) {
            const { url } = await uploadResponse.json();
            signatureUrl = url;
          }
        }
      }

      const updatedPhysician = {
        ...editingPhysician,
        signatureUrl
      };

      updatePhysicianMutation.mutate(updatedPhysician);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process signature",
        variant: "destructive",
      });
    }
  };

  // Delete physician mutation
  const deletePhysicianMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/physicians/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/physicians"] });
      toast({
        title: "Success",
        description: "Physician deleted successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to delete physician",
        variant: "destructive",
      });
    },
  });

  // Signature drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getCanvasBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        resolve(null);
        return;
      }
      canvas.toBlob(resolve, 'image/png');
    });
  };

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      setSignatureFile(file);
    }
  };

  const handleAddPhysician = async () => {
    if (!newPhysician.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Physician name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      let signatureUrl = null;

      // Handle signature upload if provided
      if (signatureMode === "upload" && signatureFile) {
        const formData = new FormData();
        formData.append('signature', signatureFile);
        
        const uploadResponse = await fetch('/api/upload-signature', {
          method: 'POST',
          body: formData,
        });
        
        if (uploadResponse.ok) {
          const { url } = await uploadResponse.json();
          signatureUrl = url;
        }
      } else if (signatureMode === "draw") {
        const blob = await getCanvasBlob();
        if (blob) {
          const formData = new FormData();
          formData.append('signature', blob, 'signature.png');
          
          const uploadResponse = await fetch('/api/upload-signature', {
            method: 'POST',
            body: formData,
          });
          
          if (uploadResponse.ok) {
            const { url } = await uploadResponse.json();
            signatureUrl = url;
          }
        }
      }

      const physicianData = {
        ...newPhysician,
        ...(signatureUrl && { signatureUrl })
      };

      addPhysicianMutation.mutate(physicianData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process signature",
        variant: "destructive",
      });
    }
  };



  const handleDeletePhysician = (id: number) => {
    deletePhysicianMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-300">Please log in to access physician management.</p>
        </div>
      </div>
    );
  }

  if (physiciansLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading physicians...</p>
        </div>
      </div>
    );
  }

  // Handle error states (like unauthorized)
  useEffect(() => {
    if (physiciansError && isUnauthorizedError(physiciansError as Error)) {
      toast({
        title: "Authentication Required",
        description: "Redirecting to login...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [physiciansError, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Physician Management
              </h1>
              <p className="text-gray-600 dark:text-gray-300">
                Manage physician profiles and information
              </p>
            </div>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Physician
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Physician</DialogTitle>
                <DialogDescription>
                  Enter the physician's information below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="Dr. John Smith"
                    value={newPhysician.name}
                    onChange={(e) => setNewPhysician(prev => ({...prev, name: e.target.value}))}
                  />
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="MD, MBBS, etc."
                    value={newPhysician.title || ""}
                    onChange={(e) => setNewPhysician(prev => ({...prev, title: e.target.value}))}
                  />
                </div>
                <div>
                  <Label htmlFor="specialty">Specialty</Label>
                  <Input
                    id="specialty"
                    placeholder="Radiology, Cardiology, etc."
                    value={newPhysician.specialty || ""}
                    onChange={(e) => setNewPhysician(prev => ({...prev, specialty: e.target.value}))}
                  />
                </div>
                
                {/* Signature Section */}
                <div className="space-y-3">
                  <Label>Signature (Optional)</Label>
                  <Tabs value={signatureMode} onValueChange={(value) => setSignatureMode(value as "upload" | "draw")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload
                      </TabsTrigger>
                      <TabsTrigger value="draw">
                        <Pen className="w-4 h-4 mr-2" />
                        Draw
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="upload" className="space-y-3">
                      <div>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureFileChange}
                          className="cursor-pointer"
                        />
                        {signatureFile && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                            <span>✓ {signatureFile.name} selected</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSignatureFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="draw" className="space-y-3">
                      <div className="border border-gray-300 rounded-lg p-2 bg-white">
                        <canvas
                          ref={canvasRef}
                          width={400}
                          height={150}
                          className="border border-gray-200 rounded cursor-crosshair touch-none"
                          style={{ width: '100%', height: '150px', maxWidth: '400px' }}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                        />
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-500">Draw your signature above</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={clearCanvas}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Clear
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleAddPhysician}
                    disabled={addPhysicianMutation.isPending}
                  >
                    {addPhysicianMutation.isPending ? "Adding..." : "Add Physician"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Physicians Grid */}
        {(physicians as Physician[]).length === 0 ? (
          <Card className="text-center py-12">
            <CardHeader>
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <CardTitle className="text-gray-600">No Physicians Added</CardTitle>
              <CardDescription>
                Add your first physician to get started with report management.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add First Physician
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(physicians as Physician[]).map((physician: Physician) => (
              <Card key={physician.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{physician.name}</CardTitle>
                      {physician.title && (
                        <CardDescription className="font-medium text-blue-600">
                          {physician.title}
                        </CardDescription>
                      )}
                      {physician.specialty && (
                        <CardDescription className="text-gray-600">
                          {physician.specialty}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingPhysician(physician)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Physician</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {physician.name}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeletePhysician(physician.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {physician.specialty && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-600">Specialty: </span>
                        <span className="text-gray-800">{physician.specialty}</span>
                      </div>
                    )}
                    {physician.signatureUrl && (
                      <div className="mt-3">
                        <span className="text-xs font-medium text-gray-600">Signature:</span>
                        <div className="mt-1 p-2 bg-gray-50 rounded border">
                          <img 
                            src={physician.signatureUrl} 
                            alt="Physician signature" 
                            className="max-h-12 max-w-full object-contain"
                          />
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      ID: {physician.id}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Physician Dialog */}
        <Dialog open={!!editingPhysician} onOpenChange={() => setEditingPhysician(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Physician</DialogTitle>
              <DialogDescription>
                Update the physician's information below.
              </DialogDescription>
            </DialogHeader>
            {editingPhysician && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    id="edit-name"
                    placeholder="Dr. John Smith"
                    value={editingPhysician.name}
                    onChange={(e) => setEditingPhysician(prev => 
                      prev ? {...prev, name: e.target.value} : null
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    placeholder="MD, MBBS, etc."
                    value={editingPhysician.title || ""}
                    onChange={(e) => setEditingPhysician(prev => 
                      prev ? {...prev, title: e.target.value} : null
                    )}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-specialty">Specialty</Label>
                  <Input
                    id="edit-specialty"
                    placeholder="Radiology, Cardiology, etc."
                    value={editingPhysician.specialty || ""}
                    onChange={(e) => setEditingPhysician(prev => 
                      prev ? {...prev, specialty: e.target.value} : null
                    )}
                  />
                </div>
                
                {/* Signature Section for Edit */}
                <div className="space-y-3">
                  <Label>Signature</Label>
                  {editingPhysician?.signatureUrl && (
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-600">Current Signature:</span>
                      <div className="mt-1 p-2 bg-gray-50 rounded border">
                        <img 
                          src={editingPhysician.signatureUrl} 
                          alt="Current signature" 
                          className="max-h-16 max-w-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                  
                  <Tabs value={signatureMode} onValueChange={(value) => setSignatureMode(value as "upload" | "draw")}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload New
                      </TabsTrigger>
                      <TabsTrigger value="draw">
                        <Pen className="w-4 h-4 mr-2" />
                        Draw New
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="upload" className="space-y-3">
                      <div>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureFileChange}
                          className="cursor-pointer"
                        />
                        {signatureFile && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                            <span>✓ {signatureFile.name} selected</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSignatureFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="draw" className="space-y-3">
                      <div className="border border-gray-300 rounded-lg p-2 bg-white">
                        <canvas
                          ref={canvasRef}
                          width={400}
                          height={150}
                          className="border border-gray-200 rounded cursor-crosshair touch-none"
                          style={{ width: '100%', height: '150px', maxWidth: '400px' }}
                          onMouseDown={startDrawing}
                          onMouseMove={draw}
                          onMouseUp={stopDrawing}
                          onMouseLeave={stopDrawing}
                          onTouchStart={startDrawing}
                          onTouchMove={draw}
                          onTouchEnd={stopDrawing}
                        />
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-500">Draw new signature above</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={clearCanvas}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Clear
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setEditingPhysician(null)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpdatePhysician}
                    disabled={updatePhysicianMutation.isPending}
                  >
                    {updatePhysicianMutation.isPending ? "Updating..." : "Update Physician"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
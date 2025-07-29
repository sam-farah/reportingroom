import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Copy, Hash, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface TextShortcut {
  id: number;
  title: string;
  shortText: string;
  category: string;
  tags: string | null;
  isGlobal: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ShortcutFormData {
  title: string;
  shortText: string;
  category: string;
  tags: string;
}

const defaultFormData: ShortcutFormData = {
  title: "",
  shortText: "",
  category: "general",
  tags: "",
};

interface TextShortcutsProps {
  onInsertText?: (text: string, shortcutId: number) => void;
  showInsertButtons?: boolean;
}

export default function TextShortcuts({ onInsertText, showInsertButtons = false }: TextShortcutsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<TextShortcut | null>(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { toast } = useToast();

  // Fetch text shortcuts
  const { data: shortcuts = [], isLoading } = useQuery({
    queryKey: ["/api/text-shortcuts"],
    retry: false,
  });

  // Create shortcut mutation
  const createShortcutMutation = useMutation({
    mutationFn: async (data: ShortcutFormData) => {
      return await apiRequest("/api/text-shortcuts", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Shortcut Created",
        description: "Text shortcut has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/text-shortcuts"] });
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
        description: error.message || "Failed to create text shortcut",
        variant: "destructive",
      });
    },
  });

  // Update shortcut mutation
  const updateShortcutMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ShortcutFormData }) => {
      return await apiRequest(`/api/text-shortcuts/${id}`, "PUT", data);
    },
    onSuccess: () => {
      toast({
        title: "Shortcut Updated",
        description: "Text shortcut has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/text-shortcuts"] });
      setIsDialogOpen(false);
      setEditingShortcut(null);
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
        title: "Update Failed",
        description: error.message || "Failed to update text shortcut",
        variant: "destructive",
      });
    },
  });

  // Delete shortcut mutation
  const deleteShortcutMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/text-shortcuts/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Shortcut Deleted",
        description: "Text shortcut has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/text-shortcuts"] });
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
        description: error.message || "Failed to delete text shortcut",
        variant: "destructive",
      });
    },
  });

  // Increment usage mutation
  const incrementUsageMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/text-shortcuts/${id}/use`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/text-shortcuts"] });
    },
  });

  const handleCreateShortcut = () => {
    setEditingShortcut(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleEditShortcut = (shortcut: TextShortcut) => {
    setEditingShortcut(shortcut);
    setFormData({
      title: shortcut.title,
      shortText: shortcut.shortText,
      category: shortcut.category,
      tags: shortcut.tags || "",
    });
    setIsDialogOpen(true);
  };

  const handleDeleteShortcut = (id: number) => {
    if (confirm("Are you sure you want to delete this text shortcut?")) {
      deleteShortcutMutation.mutate(id);
    }
  };

  const handleSaveShortcut = () => {
    if (editingShortcut) {
      updateShortcutMutation.mutate({ id: editingShortcut.id, data: formData });
    } else {
      createShortcutMutation.mutate(formData);
    }
  };

  const handleInsertShortcut = (shortcut: TextShortcut) => {
    if (onInsertText) {
      onInsertText(shortcut.shortText, shortcut.id);
      incrementUsageMutation.mutate(shortcut.id);
    }
  };

  const handleCopyToClipboard = (text: string, shortcutId: number) => {
    navigator.clipboard.writeText(text);
    incrementUsageMutation.mutate(shortcutId);
    toast({
      title: "Copied to Clipboard",
      description: "Text shortcut has been copied to clipboard",
    });
  };

  // Filter shortcuts
  const filteredShortcuts = shortcuts.filter((shortcut: TextShortcut) => {
    const matchesSearch = 
      shortcut.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shortcut.shortText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shortcut.tags && shortcut.tags.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = categoryFilter === "all" || shortcut.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = Array.from(new Set(shortcuts.map((s: TextShortcut) => s.category)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Text Shortcuts</h2>
          <p className="text-gray-600 mt-1">Manage frequently used text snippets for faster report writing</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleCreateShortcut} className="bg-[var(--medical-primary)] hover:bg-[var(--medical-primary)]/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Shortcut
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingShortcut ? "Edit Text Shortcut" : "Create Text Shortcut"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g., Normal Venous Study"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="findings">Findings</SelectItem>
                    <SelectItem value="impressions">Impressions</SelectItem>
                    <SelectItem value="recommendations">Recommendations</SelectItem>
                    <SelectItem value="indications">Indications</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="shortText">Text Content</Label>
                <Textarea
                  id="shortText"
                  value={formData.shortText}
                  onChange={(e) => setFormData({...formData, shortText: e.target.value})}
                  placeholder="Enter the text content..."
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                  placeholder="e.g., normal, venous, study"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleSaveShortcut}
                  disabled={createShortcutMutation.isPending || updateShortcutMutation.isPending}
                  className="flex-1"
                >
                  {editingShortcut ? "Update" : "Create"} Shortcut
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <Input
            placeholder="Search shortcuts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Shortcuts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            Loading shortcuts...
          </div>
        ) : filteredShortcuts.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            {searchTerm || categoryFilter !== "all" ? "No shortcuts match your filters" : "No text shortcuts created yet"}
          </div>
        ) : (
          filteredShortcuts.map((shortcut: TextShortcut) => (
            <Card key={shortcut.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-sm font-semibold">{shortcut.title}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {shortcut.category}
                      </Badge>
                      <span className="text-xs text-gray-500 flex items-center">
                        <Hash className="h-3 w-3 mr-1" />
                        {shortcut.usageCount} uses
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditShortcut(shortcut)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteShortcut(shortcut.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                  {shortcut.shortText}
                </p>
                {shortcut.tags && (
                  <div className="flex items-center gap-1 mb-3">
                    <Tag className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{shortcut.tags}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  {showInsertButtons && onInsertText && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleInsertShortcut(shortcut)}
                      className="flex-1 text-xs"
                    >
                      Insert
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyToClipboard(shortcut.shortText, shortcut.id)}
                    className="flex-1 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
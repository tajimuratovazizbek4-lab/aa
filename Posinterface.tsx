import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  X,
  Search,
  User as UserIcon,
  Plus,
  X as CloseIcon,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  WideDialog,
  WideDialogContent,
  WideDialogHeader,
  WideDialogTitle,
} from "@/components/ui/wide-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  fetchAllProducts,
  fetchProductByBarcode,
} from "@/core/api/fetchAllProducts";
import type { Product } from "@/core/api/product";
import { useCurrentUser } from "@/core/hooks/useCurrentUser";
import { useGetUsers } from "@/core/api/user";
import { useGetClients, useCreateClient } from "@/core/api/client";
import type { User } from "@/core/api/user";
import { OpenShiftForm } from "./OpenShiftForm";
import { useCreateSale, type Sale } from "@/core/api/sale";
import {
  saleReceiptService,
  type SaleData,
} from "@/services/saleReceiptService";
import { toast } from "sonner";
import type { Stock } from "@/core/api/stock";
import { StockSelectionModal } from "./StockSelectionModal";

interface ProductInCart {
  id: number;
  productId: number;
  name: string;
  price: number;
  quantity: number;
  total: number;
  product: Product;
  barcode?: string;
  selectedUnit: {
    id: number;
    short_name: string;
    factor: number;
    is_base: boolean;
  } | null;
  stock?: Stock;
  stockId?: number;
}

interface ExtendedUser extends User {
  store_read?: {
    id: number;
    name: string;
    address: string;
    phone_number: string;
    budget: string;
    created_at: string;
    is_main: boolean;
    parent_store: number | null;
    owner: number;
  };
}

interface SessionState {
  id: string;
  name: string;
  currentInput: string;
  previousInput: string;
  operation: string;
  waitingForNewValue: boolean;
  products: ProductInCart[];
  focusedProductIndex: number;
  selectedSeller: number | null;
  selectedClient: number | null;
  clientSearchTerm: string;
  onCredit: boolean;
  debtDeposit: string;
  debtDueDate: string;
  depositPaymentMethod: string;
}

interface SalePayment {
  amount: number;
  payment_method: string;
}

interface SalePayload {
  store: number;
  sold_by: number;
  on_credit: boolean;
  sale_items: {
    product_write: number;
    quantity: number;
    selling_unit: number;
    price_per_unit: number;
  }[];
  sale_payments: SalePayment[];
  sale_debt?: {
    client: number;
    deposit: number;
    due_date: string;
    deposit_payment_method: string;
  };
}

// Main POS component with all hooks
const POSInterfaceCore = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine if we're in fullscreen route
  const isFullscreenRoute = location.pathname === "/pos-fullscreen";

  // Load state from localStorage
  const loadStateFromStorage = () => {
    try {
      const savedSessions = localStorage.getItem("pos-sessions");
      const savedSessionIndex = localStorage.getItem(
        "pos-current-session-index",
      );

      if (savedSessions) {
        const parsedSessions = JSON.parse(savedSessions);
        const sessionIndex = savedSessionIndex
          ? parseInt(savedSessionIndex, 10)
          : 0;
        return {
          sessions: parsedSessions,
          currentSessionIndex: Math.max(
            0,
            Math.min(sessionIndex, parsedSessions.length - 1),
          ),
        };
      }
    } catch (error) {
      console.error("Error loading POS state from localStorage:", error);
    }

    // Return default state if no saved state or error
    return {
      sessions: [
        {
          id: "1",
          name: "Сессия 1",
          currentInput: "",
          previousInput: "",
          operation: "",
          waitingForNewValue: false,
          products: [],
          focusedProductIndex: -1,
          selectedSeller: null,
          selectedClient: null,
          clientSearchTerm: "",
          onCredit: false,
          debtDeposit: "",
          debtDueDate: "",
          depositPaymentMethod: "Наличные",
        },
      ],
      currentSessionIndex: 0,
    };
  };

  // Initialize state from localStorage
  const initialState = loadStateFromStorage();

  // Session management
  const [sessions, setSessions] = useState<SessionState[]>(
    initialState.sessions,
  );
  const [currentSessionIndex, setCurrentSessionIndex] = useState(
    initialState.currentSessionIndex,
  );

  // Current session state (derived from active session)
  const currentSession = sessions[currentSessionIndex];
  const [currentInput, setCurrentInput] = useState(currentSession.currentInput);
  const [previousInput, setPreviousInput] = useState(
    currentSession.previousInput,
  );
  const [operation, setOperation] = useState<string>(currentSession.operation);
  const [waitingForNewValue, setWaitingForNewValue] = useState(
    currentSession.waitingForNewValue,
  );
  const [cartProducts, setCartProducts] = useState<ProductInCart[]>(
    currentSession.products,
  );
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(
    currentSession.focusedProductIndex,
  );
  const [selectedSeller, setSelectedSeller] = useState<number | null>(
    currentSession.selectedSeller,
  );
  const [selectedClient, setSelectedClient] = useState<number | null>(
    currentSession.selectedClient,
  );
  const [clientSearchTerm, setClientSearchTerm] = useState(
    currentSession.clientSearchTerm,
  );
  const [onCredit, setOnCredit] = useState(currentSession.onCredit);
  const [debtDeposit, setDebtDeposit] = useState(currentSession.debtDeposit);
  const [debtDueDate, setDebtDueDate] = useState(currentSession.debtDueDate);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState(
    currentSession.depositPaymentMethod,
  );

  // Global modal states (shared across sessions)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeSearchTerm, setBarcodeSearchTerm] = useState("");
  const [fetchedProducts, setFetchedProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [barcodeScanInput, setBarcodeScanInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingBarcode, setIsProcessingBarcode] = useState(false);
  const [debugMode, setDebugMode] = useState(false); // Toggle with Ctrl+D
  const [lastScannedBarcode, setLastScannedBarcode] = useState("");
  // Quantity modal state
  const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false);
  const [selectedProductForQuantity, setSelectedProductForQuantity] =
    useState<ProductInCart | null>(null);
  const [selectedProductIndexForQuantity, setSelectedProductIndexForQuantity] =
    useState<number | null>(null);
  const [isManualQuantityMode, setIsManualQuantityMode] = useState(false);
  const [manualQuantityInput, setManualQuantityInput] = useState("");

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<SalePayment[]>([
    { amount: 0, payment_method: "Наличные" },
  ]);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Sale API
  const createSaleMutation = useCreateSale();
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const createClientMutation = useCreateClient();

  // Unique cart item id generator to avoid collisions when adding multiple items at once
  const cartItemIdRef = useRef<number>(Date.now());
  const generateCartItemId = () => {
    cartItemIdRef.current += 1;
    return cartItemIdRef.current;
  };

  // Product selection state
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(
    new Set(),
  );

  // User selection modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Stock selection modal state
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [productForStockSelection, setProductForStockSelection] =
    useState<Product | null>(null);

  // Client creation modal state
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false);
  const [newClientData, setNewClientData] = useState({
    type: 'Физ.лицо' as 'Физ.лицо' | 'Юр.лицо',
    name: '',
    phone_number: '+998',
    address: '',
    ceo_name: '',
    balance: 0,
  });

  // Price modal state
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [selectedProductForPrice, setSelectedProductForPrice] =
    useState<ProductInCart | null>(null);
  const [selectedProductIndexForPrice, setSelectedProductIndexForPrice] =
    useState<number | null>(null);
  const [priceInput, setPriceInput] = useState("");

  // Calculator visibility state
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(true);

  // Fullscreen mode state - default based on route
  const [isFullscreenMode, setIsFullscreenMode] = useState(isFullscreenRoute);

  // User data
  const { data: currentUser } = useCurrentUser();
  
  // Check user roles
  const isAdmin = currentUser?.role === "Администратор";
  const isSuperUser = currentUser?.is_superuser === true;
  
  // Only fetch users if admin or superuser - sellers don't need the full user list
  const { data: usersData } = useGetUsers({
    enabled: !!currentUser && (isAdmin || isSuperUser),
  });
  const { data: clientsData } = useGetClients({
    params: { name: clientSearchTerm },
  });

  const users = Array.isArray(usersData) ? usersData : usersData?.results || [];
  const clients = Array.isArray(clientsData)
    ? clientsData
    : clientsData?.results || [];

  // Save current session state whenever it changes
  useEffect(() => {
    setSessions((prev) =>
      prev.map((session, index) =>
        index === currentSessionIndex
          ? {
              ...session,
              currentInput,
              previousInput,
              operation,
              waitingForNewValue,
              products: cartProducts,
              focusedProductIndex,
              selectedSeller,
              selectedClient,
              clientSearchTerm,
              onCredit,
              debtDeposit,
              debtDueDate,
              depositPaymentMethod,
            }
          : session,
      ),
    );
  }, [
    currentSessionIndex,
    currentInput,
    previousInput,
    operation,
    waitingForNewValue,
    cartProducts,
    focusedProductIndex,
    selectedSeller,
    selectedClient,
    clientSearchTerm,
    onCredit,
    debtDeposit,
    debtDueDate,
    depositPaymentMethod,
  ]);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("pos-sessions", JSON.stringify(sessions));
    } catch (error) {
      console.error("Error saving sessions to localStorage:", error);
    }
  }, [sessions]);

  // Save current session index to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(
        "pos-current-session-index",
        currentSessionIndex.toString(),
      );
    } catch (error) {
      console.error("Error saving session index to localStorage:", error);
    }
  }, [currentSessionIndex]);

  // Sync fullscreen mode with route
  useEffect(() => {
    setIsFullscreenMode(isFullscreenRoute);
  }, [isFullscreenRoute, location.pathname]);

  // Initialize seller selection for non-admin users
  useEffect(() => {
    console.log("Seller selection debug:", {
      isAdmin,
      isSuperUser,
      currentUserId: currentUser?.id,
      selectedSeller,
      currentUserRole: currentUser?.role,
      usersCount: users.length,
      usersData: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    });

    if (!isAdmin && !isSuperUser && currentUser?.id && !selectedSeller) {
      console.log("Setting selectedSeller to:", currentUser.id);
      setSelectedSeller(currentUser.id);
    }
  }, [currentUser?.id, isAdmin, isSuperUser, selectedSeller]);

  // Calculate totals
  const total = cartProducts.reduce((sum, product) => sum + product.total, 0);

  // Fetch products when modal opens or search term changes
  useEffect(() => {
    if (isSearchModalOpen) {
      const timeoutId = setTimeout(() => {
        setLoadingProducts(true);
        fetchAllProducts({
          product_name: searchTerm.length > 0 ? searchTerm : undefined,
          barcode: barcodeSearchTerm.length > 0 ? barcodeSearchTerm : undefined,
        })
          .then((data) => setFetchedProducts(data))
          .catch((error) => {
            console.error("Error fetching products:", error);
            toast.error("Ошибка при загрузке товаров");
          })
          .finally(() => setLoadingProducts(false));
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [isSearchModalOpen, searchTerm, barcodeSearchTerm]);

  // Handle adding product directly to cart
  const handleProductDirectAdd = useCallback(
    (product: Product, stock?: Stock) => {
      if (product.product_name && product.id) {
        // Check if product has quantity available
        const availableQuantity = product.quantity
          ? parseFloat(String(product.quantity))
          : 0;

        if (availableQuantity <= 0) {
          return;
        }

        // Check if product requires stock selection
        if (product.category_read?.sell_from_stock && !stock) {
          // Show stock selection modal
          setProductForStockSelection(product);
          setIsStockModalOpen(true);
          return;
        }

        // Get default unit (base unit or first available)
        const defaultUnit = product.available_units?.find(
          (unit) => unit.is_base,
        ) ||
          product.available_units?.[0] || {
            id: product.base_unit || 1,
            short_name: "шт",
            factor: 1,
            is_base: true,
          };
        // Use selling_price from product data, fallback to min_price
        const price = product.selling_price
          ? parseFloat(String(product.selling_price))
          : product.min_price
            ? parseFloat(String(product.min_price))
            : 10000;

        // Check if product already exists in cart
        const existingProductIndex = cartProducts.findIndex(
          (p) => p.productId === product.id && p.stockId === stock?.id,
        );

        if (existingProductIndex >= 0) {
          // Product already in cart - increment quantity by 1 without showing modal
          const updatedProducts = cartProducts.map((p, idx) =>
            idx === existingProductIndex
              ? {
                  ...p,
                  quantity: p.quantity + 1,
                  total: p.price * (p.quantity + 1),
                }
              : p,
          );
          setCartProducts(updatedProducts);
        } else {
          // Add new product to cart with quantity 1
          const newProduct: ProductInCart = {
            id: generateCartItemId(),
            productId: product.id,
            name: product.product_name,
            price: price,
            quantity: 1,
            total: price,
            product: product,
            barcode: product.barcode,
            selectedUnit: defaultUnit || null,
            stock: stock,
            stockId: stock?.id,
          };
          setCartProducts((prev) => [...prev, newProduct]);
        }
      }
    },
    [cartProducts],
  );

  // Handle stock selection
  const handleStockSelect = useCallback(
    (stock: Stock) => {
      if (productForStockSelection) {
        handleProductDirectAdd(productForStockSelection, stock);
        setProductForStockSelection(null);
      }
    },
    [productForStockSelection, handleProductDirectAdd],
  );

  // Handle barcode scanning with Enter key support
  const processBarcodeInput = useCallback(
    async (barcode: string) => {
      if (isProcessingBarcode) return;

      // Clean the barcode (remove any whitespace)
      const cleanBarcode = barcode.trim();

      if (cleanBarcode.length >= 6) {
        setIsProcessingBarcode(true);
        setLoadingProducts(true);

        try {
          const product = await fetchProductByBarcode(cleanBarcode);
          if (product) {
            handleProductDirectAdd(product);
            if (debugMode) {
              console.log("✅ Product found and added:", product);
            }
          } else {
            // eslint-disable-next-line no-constant-condition
            if (debugMode || true) {
              // Always log when product not found
              console.warn("❌ Product not found for barcode:", cleanBarcode);
            }
            toast.error(`Товар не найден по штрих-коду: ${cleanBarcode}`);
          }
        } catch (error) {
          console.error("Error fetching product by barcode:", error);
          toast.error("Ошибка при поиске товара по штрих-коду");
        } finally {
          setLoadingProducts(false);
          setIsProcessingBarcode(false);
          setBarcodeScanInput("");
          // Refocus the input
          if (barcodeInputRef.current) {
            barcodeInputRef.current.focus();
          }
        }
      }
    },
    [isProcessingBarcode, handleProductDirectAdd],
  );

  // Handle barcode input changes and Enter key
  const handleBarcodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBarcodeScanInput(value);
    if (debugMode) {
      console.log("📝 Barcode input changed:", {
        newValue: value,
        length: value.length,
        lastChar: value[value.length - 1],
        charCode: value.charCodeAt(value.length - 1),
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (debugMode) {
      console.log("⌨️ Key pressed in barcode input:", {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        charCode: e.charCode,
        currentValue: barcodeScanInput,
        valueLength: barcodeScanInput.length,
        timestamp: new Date().toISOString(),
      });
    }

    if (
      e.key === "Enter" ||
      e.key === "\n" ||
      e.key === "\r" ||
      e.keyCode === 13
    ) {
      e.preventDefault();
      console.log(
        "✅ ENTER KEY DETECTED! Processing barcode:",
        barcodeScanInput,
        "Length:",
        barcodeScanInput.length,
      );
      setLastScannedBarcode(barcodeScanInput);
      processBarcodeInput(barcodeScanInput);
    }
  };

  // Debug mode toggle with Ctrl+D and global keyboard logging
  useEffect(() => {
    const handleDebugToggle = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        setDebugMode((prev) => {
          const newMode = !prev;
          console.log(`Debug mode ${newMode ? "ENABLED" : "DISABLED"}`);
          return newMode;
        });
      }
    };

    // Global keyboard event logger for debugging scanner
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (debugMode) {
        console.log("🎹 GLOBAL KEY EVENT:", {
          key: e.key,
          code: e.code,
          keyCode: e.keyCode,
          charCode: e.charCode,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          target: e.target,
          targetTagName: (e.target as HTMLElement)?.tagName,
          targetId: (e.target as HTMLElement)?.id,
          timestamp: new Date().toISOString(),
        });
      }
    };

    document.addEventListener("keydown", handleDebugToggle);
    document.addEventListener("keydown", handleGlobalKeydown);

    return () => {
      document.removeEventListener("keydown", handleDebugToggle);
      document.removeEventListener("keydown", handleGlobalKeydown);
    };
  }, [debugMode]);

  // Keep barcode input always focused
  useEffect(() => {
    const focusInput = () => {
      // Don't refocus if any modal is open
      if (isSearchModalOpen || isQuantityModalOpen || isPriceModalOpen || isPaymentModalOpen || isUserModalOpen) {
        return;
      }
      
      // Don't refocus if user is actively typing in an input field
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT" ||
          (activeElement as any).contentEditable === "true");

      if (
        barcodeInputRef.current &&
        !isInputFocused &&
        document.activeElement !== barcodeInputRef.current
      ) {
        if (debugMode) {
          console.log("Refocusing barcode input");
        }
        barcodeInputRef.current.focus();
      }
    };

    // Initial focus
    focusInput();

    // Refocus when clicking anywhere on the document (but respect input focus)
    const handleClick = (event: MouseEvent) => {
      // Don't refocus if any modal is open
      if (isSearchModalOpen || isQuantityModalOpen || isPriceModalOpen || isPaymentModalOpen || isUserModalOpen) {
        return;
      }
      
      const target = event.target as HTMLElement;
      // Don't refocus if clicking on an input element or its container
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest("select"))
      ) {
        return;
      }
      setTimeout(focusInput, 100);
    };

    // Refocus on window focus
    const handleWindowFocus = () => {
      // Don't refocus if any modal is open
      if (isSearchModalOpen || isQuantityModalOpen || isPriceModalOpen || isPaymentModalOpen || isUserModalOpen) {
        return;
      }
      focusInput();
    };

    document.addEventListener("click", handleClick);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [currentSessionIndex, isSearchModalOpen, isQuantityModalOpen, isPriceModalOpen, isPaymentModalOpen, isUserModalOpen, debugMode]);

  // Filter products based on search term
  const filteredProducts = useMemo(() => {
    return fetchedProducts.filter((product) => {
      const matchesName = !searchTerm || 
        product.product_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBarcode = !barcodeSearchTerm || 
        product.barcode?.includes(barcodeSearchTerm);
      const matchesId = !searchTerm || String(product.id).includes(searchTerm);
      
      return (matchesName || matchesId) && matchesBarcode;
    });
  }, [fetchedProducts, searchTerm, barcodeSearchTerm]);

  const handleNumberClick = (num: string) => {
    // Pure calculator behavior
    if (waitingForNewValue) {
      setCurrentInput(num);
      setWaitingForNewValue(false);
    } else {
      setCurrentInput((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setCurrentInput((prev) => prev.slice(0, -1));
    setWaitingForNewValue(false);
  };

  const handleOperation = (nextOperation: string) => {
    const inputValue = parseFloat(currentInput.replace(",", ".")) || 0;

    if (previousInput === "" || waitingForNewValue) {
      setPreviousInput(inputValue.toString());
    } else if (operation) {
      const currentValue = parseFloat(currentInput.replace(",", ".")) || 0;
      const previousValue = parseFloat(previousInput) || 0;
      let result = 0;

      switch (operation) {
        case "+":
          result = previousValue + currentValue;
          break;
        case "-":
          result = previousValue - currentValue;
          break;
        case "*":
          result = previousValue * currentValue;
          break;
        case "/":
          result = currentValue !== 0 ? previousValue / currentValue : 0;
          break;
        default:
          return;
      }

      setPreviousInput(result.toString());
      setCurrentInput(result.toString());
    }

    setWaitingForNewValue(true);
    setOperation(nextOperation);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(currentInput.replace(",", ".")) || 0;
    const previousValue = parseFloat(previousInput) || 0;
    let result = 0;

    if (operation && previousInput !== "") {
      switch (operation) {
        case "+":
          result = previousValue + inputValue;
          break;
        case "-":
          result = previousValue - inputValue;
          break;
        case "*":
          result = previousValue * inputValue;
          break;
        case "/":
          result = inputValue !== 0 ? previousValue / inputValue : 0;
          break;
        default:
          return;
      }

      setCurrentInput(result.toString());
      setPreviousInput("");
      setOperation("");
      setWaitingForNewValue(true);
    }
  };

  const handleClearInput = () => {
    setCurrentInput("");
    setPreviousInput("");
    setOperation("");
    setWaitingForNewValue(false);
  };

  const handleSearchClick = useCallback(() => {
    setIsSearchModalOpen(true);
    setSearchTerm("");
    setBarcodeSearchTerm("");
  }, []);

  const handleUserClick = () => {
    setIsUserModalOpen(true);
    // Initialize seller selection based on user role
    if (!isAdmin && !isSuperUser && currentUser?.id) {
      setSelectedSeller(currentUser.id);
    }
  };

  // Session management functions
  const createNewSession = () => {
    const newSessionId = (sessions.length + 1).toString();
    const newSession: SessionState = {
      id: newSessionId,
      name: `Сессия ${newSessionId}`,
      currentInput: "",
      previousInput: "",
      operation: "",
      waitingForNewValue: false,
      products: [],
      focusedProductIndex: -1,
      selectedSeller:
        !isAdmin && !isSuperUser && currentUser?.id ? currentUser.id : null,
      selectedClient: null,
      clientSearchTerm: "",
      onCredit: false,
      debtDeposit: "",
      debtDueDate: "",
      depositPaymentMethod: "Наличные",
    };

    setSessions((prev) => [...prev, newSession]);
    const newIndex = sessions.length;
    setCurrentSessionIndex(newIndex);

    // Clear all state for the new session
    setCurrentInput("");
    setPreviousInput("");
    setOperation("");
    setWaitingForNewValue(false);
    setCartProducts([]);
    setFocusedProductIndex(-1);
    setSelectedSeller(
      !isAdmin && !isSuperUser && currentUser?.id ? currentUser.id : null,
    );
    setSelectedClient(null);
    setClientSearchTerm("");
    setOnCredit(false);
    setDebtDeposit("");
    setDebtDueDate("");
    setDepositPaymentMethod("Наличные");
  };

  // Auto-update session name based on selected client or seller
  useEffect(() => {
    const currentSessionData = sessions[currentSessionIndex];
    if (!currentSessionData) return;

    let newName = `Сессия ${currentSessionData.id}`;

    if (selectedClient) {
      const client = clients.find((c) => c.id === selectedClient);
      if (client?.name) {
        newName = client.name;
      }
    } else if (selectedSeller) {
      const seller = users.find((u) => u.id === selectedSeller);
      if (seller?.name) {
        newName = `${seller.name || ""}`.trim();
      }
    }

    if (newName !== currentSessionData.name) {
      setSessions((prev) =>
        prev.map((session, index) =>
          index === currentSessionIndex
            ? { ...session, name: newName }
            : session,
        ),
      );
    }
  }, [
    selectedClient,
    selectedSeller,
    currentSessionIndex,
    clients,
    users,
    sessions,
  ]);

  const switchToSession = (index: number) => {
    if (index >= 0 && index < sessions.length) {
      // First save current session state
      const updatedSessions = [...sessions];
      updatedSessions[currentSessionIndex] = {
        ...updatedSessions[currentSessionIndex],
        currentInput,
        previousInput,
        operation,
        waitingForNewValue,
        products: cartProducts,
        focusedProductIndex,
        selectedSeller,
        selectedClient,
        clientSearchTerm,
        onCredit,
        debtDeposit,
        debtDueDate,
        depositPaymentMethod,
      };
      setSessions(updatedSessions);

      // Then switch to new session
      const targetSession = updatedSessions[index];
      setCurrentSessionIndex(index);

      // Load target session state
      setCurrentInput(targetSession.currentInput);
      setPreviousInput(targetSession.previousInput);
      setOperation(targetSession.operation);
      setWaitingForNewValue(targetSession.waitingForNewValue);
      setCartProducts(targetSession.products);
      setFocusedProductIndex(targetSession.focusedProductIndex);
      setSelectedSeller(targetSession.selectedSeller);
      setSelectedClient(targetSession.selectedClient);
      setClientSearchTerm(targetSession.clientSearchTerm);
      setOnCredit(targetSession.onCredit);
      setDebtDeposit(targetSession.debtDeposit);
      setDebtDueDate(targetSession.debtDueDate);
      setDepositPaymentMethod(targetSession.depositPaymentMethod);
    }
  };

  const closeSession = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) return; // Don't close if it's the last session

    setSessions((prev) => prev.filter((_, i) => i !== index));

    // Adjust current session index if needed
    if (currentSessionIndex >= index) {
      const newIndex = Math.max(0, currentSessionIndex - 1);
      setCurrentSessionIndex(newIndex);

      // Load the new active session
      const newActiveSession = sessions[newIndex];
      if (newActiveSession) {
        setCurrentInput(newActiveSession.currentInput);
        setPreviousInput(newActiveSession.previousInput);
        setOperation(newActiveSession.operation);
        setWaitingForNewValue(newActiveSession.waitingForNewValue);
        setCartProducts(newActiveSession.products);
        setFocusedProductIndex(newActiveSession.focusedProductIndex);
        setSelectedSeller(newActiveSession.selectedSeller);
        setSelectedClient(newActiveSession.selectedClient);
        setClientSearchTerm(newActiveSession.clientSearchTerm);
        setOnCredit(newActiveSession.onCredit);
        setDebtDeposit(newActiveSession.debtDeposit);
        setDebtDueDate(newActiveSession.debtDueDate);
        setDepositPaymentMethod(newActiveSession.depositPaymentMethod);
      }
    }
  };

  const handleProductSelect = (product: Product) => {
    // Always use multi-select behavior
    setSelectedProducts((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(product.id!)) {
        newSelection.delete(product.id!);
      } else {
        newSelection.add(product.id!);
      }
      return newSelection;
    });

    console.log("Selected product:", product);
  };

  const handleSaveSelectedProducts = () => {
    // Add all selected products to cart
    const selectedProductItems = fetchedProducts.filter((product) =>
      selectedProducts.has(product.id!),
    );

    selectedProductItems.forEach((product) => {
      handleProductDirectAdd(product);
    });

    // Reset selection state
    setSelectedProducts(new Set());
    setIsSearchModalOpen(false);
  };

  const updateProductQuantity = useCallback(
    (productId: number, newQuantity: number, atIndex?: number | null) => {
      // Prevent negative or zero quantities
      if (newQuantity <= 0) {
        return;
      }

      setCartProducts((prev) =>
        prev.map((p, idx) => {
          if ((atIndex ?? -1) === idx || p.id === productId) {
            // Check available quantity
            const availableQuantity = p.product.quantity
              ? parseFloat(String(p.product.quantity))
              : 0;
            if (newQuantity > availableQuantity) {
              toast.error(
                `Недостаточно товара "${p.name}". Доступно: ${availableQuantity}`,
              );
              return p; // Don't update if exceeds available quantity
            }
            return {
              ...p,
              quantity: newQuantity,
              total: p.price * newQuantity,
            };
          }
          return p;
        }),
      );
    },
    [],
  );

  const removeProduct = useCallback((productId: number) => {
    setCartProducts((prev) => prev.filter((p) => p.id !== productId));
  }, []);

  // Handle quantity modal
  const handleQuantityClick = (product: ProductInCart, index?: number) => {
    setSelectedProductForQuantity(product);
    setSelectedProductIndexForQuantity(index ?? null);
    setIsQuantityModalOpen(true);
    setIsManualQuantityMode(false);
    setManualQuantityInput("");
  };

  // Handle price modal
  const handlePriceNumberClick = (num: string) => {
    if (num === "." && priceInput.includes(".")) return;
    setPriceInput((prev) => prev + num);
  };

  const handlePriceBackspace = () => {
    setPriceInput((prev) => prev.slice(0, -1));
  };

  const handlePriceClear = () => {
    setPriceInput("");
  };

  const handlePriceSubmit = () => {
    if (selectedProductForPrice && priceInput) {
      const newPrice = parseFloat(priceInput) || 0;
      const updatedProducts = cartProducts.map((p, idx) =>
        (selectedProductIndexForPrice ?? -1) === idx || p.id === selectedProductForPrice.id
          ? {
              ...p,
              price: newPrice,
              total: newPrice * p.quantity,
            }
          : p,
      );
      setCartProducts(updatedProducts);
      setIsPriceModalOpen(false);
      setSelectedProductForPrice(null);
      setSelectedProductIndexForPrice(null);
      setPriceInput("");
    }
  };

  const handleQuantitySelect = (quantity: number) => {
    if (selectedProductForQuantity) {
      updateProductQuantity(
        selectedProductForQuantity.id,
        quantity,
        selectedProductIndexForQuantity,
      );
    }
    setIsQuantityModalOpen(false);
    setSelectedProductForQuantity(null);
    setSelectedProductIndexForQuantity(null);
    setIsManualQuantityMode(false);
    setManualQuantityInput("");
  };

  const handleManualQuantityMode = () => {
    setIsManualQuantityMode(true);
    if (selectedProductForQuantity) {
      setManualQuantityInput(selectedProductForQuantity.quantity.toString());
    }
  };

  const handleManualQuantitySubmit = () => {
    const quantity = parseFloat(manualQuantityInput);
    if (quantity > 0 && selectedProductForQuantity) {
      updateProductQuantity(
        selectedProductForQuantity.id,
        quantity,
        selectedProductIndexForQuantity,
      );
      setIsQuantityModalOpen(false);
      setSelectedProductForQuantity(null);
      setSelectedProductIndexForQuantity(null);
      setIsManualQuantityMode(false);
      setManualQuantityInput("");
    }
  };

  const clearCart = () => {
    setCartProducts([]);
    setFocusedProductIndex(-1);
  };

  // Utility function to clear localStorage state
  const clearPersistedState = () => {
    try {
      localStorage.removeItem("pos-sessions");
      localStorage.removeItem("pos-current-session-index");
    } catch (error) {
      console.error("Error clearing POS state from localStorage:", error);
    }
  };

  // Keyboard navigation handlers
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Handle global shortcuts that work regardless of cart state
      switch (e.key) {
        case "b":
        case "B":
          e.preventDefault();
          handleSearchClick();
          return;
        case "l":
        case "L":
          e.preventDefault();
          if (cartProducts.length > 0) {
            setDiscountAmount(0);
            setPaymentMethods([{ amount: 0, payment_method: "Наличные" }]);
            setIsPaymentModalOpen(true);
          }
          return;
        case "F1":
          e.preventDefault();
          if (isPaymentModalOpen) {
            const hasNalichnye = paymentMethods.some(
              (p) => p.payment_method === "Наличные",
            );
            if (!hasNalichnye) {
              const totalPaid = paymentMethods.reduce(
                (sum, p) => sum + (p.amount || 0),
                0,
              );
              const remaining = total - totalPaid;
              setPaymentMethods((prev) => [
                ...prev,
                {
                  amount: remaining > 0 ? remaining : 0,
                  payment_method: "Наличные",
                },
              ]);
            }
          }
          return;
        case "F2":
          e.preventDefault();
          if (isPaymentModalOpen) {
            const hasClick = paymentMethods.some(
              (p) => p.payment_method === "Click",
            );
            if (!hasClick) {
              const totalPaid = paymentMethods.reduce(
                (sum, p) => sum + (p.amount || 0),
                0,
              );
              const remaining = total - totalPaid;
              setPaymentMethods((prev) => [
                ...prev,
                {
                  amount: remaining > 0 ? remaining : 0,
                  payment_method: "Click",
                },
              ]);
            }
          }
          return;
        case "F3":
          e.preventDefault();
          if (isPaymentModalOpen) {
            const hasKarta = paymentMethods.some(
              (p) => p.payment_method === "Карта",
            );
            if (!hasKarta) {
              const totalPaid = paymentMethods.reduce(
                (sum, p) => sum + (p.amount || 0),
                0,
              );
              const remaining = total - totalPaid;
              setPaymentMethods((prev) => [
                ...prev,
                {
                  amount: remaining > 0 ? remaining : 0,
                  payment_method: "Карта",
                },
              ]);
            }
          }
          return;
        case "F4":
          e.preventDefault();
          if (isPaymentModalOpen) {
            const hasPerechislenie = paymentMethods.some(
              (p) => p.payment_method === "Перечисление",
            );
            if (!hasPerechislenie) {
              const totalPaid = paymentMethods.reduce(
                (sum, p) => sum + (p.amount || 0),
                0,
              );
              const remaining = total - totalPaid;
              setPaymentMethods((prev) => [
                ...prev,
                {
                  amount: remaining > 0 ? remaining : 0,
                  payment_method: "Перечисление",
                },
              ]);
            }
          }
          return;
      }

      // Handle navigation shortcuts only when cart has items
      if (cartProducts.length === 0) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setFocusedProductIndex((prev) =>
            prev <= 0 ? cartProducts.length - 1 : prev - 1,
          );
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedProductIndex((prev) =>
            prev >= cartProducts.length - 1 ? 0 : prev + 1,
          );
          break;
        case "+":
          e.preventDefault();
          if (focusedProductIndex >= 0) {
            const product = cartProducts[focusedProductIndex];
            updateProductQuantity(product.id, product.quantity + 1, focusedProductIndex);
          }
          break;
        case "-":
          e.preventDefault();
          if (focusedProductIndex >= 0) {
            const product = cartProducts[focusedProductIndex];
            const newQuantity = product.quantity - 1;
            if (newQuantity > 0) {
              updateProductQuantity(product.id, newQuantity, focusedProductIndex);
            }
          }
          break;
        case "Delete":
        case "Backspace":
          if (e.target === document.body && focusedProductIndex >= 0) {
            e.preventDefault();
            const product = cartProducts[focusedProductIndex];
            removeProduct(product.id);
            setFocusedProductIndex((prev) =>
              prev >= cartProducts.length - 1 ? cartProducts.length - 2 : prev,
            );
          }
          break;
      }
    },
    [
      cartProducts,
      focusedProductIndex,
      updateProductQuantity,
      removeProduct,
      handleSearchClick,
      total,
      setPaymentMethods,
      setIsPaymentModalOpen,
      isPaymentModalOpen,
      paymentMethods,
    ],
  );

  // Set up keyboard event listeners
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Auto-focus first product when products are added
  useEffect(() => {
    if (cartProducts.length > 0 && focusedProductIndex === -1) {
      setFocusedProductIndex(0);
    } else if (cartProducts.length === 0) {
      setFocusedProductIndex(-1);
    }
  }, [cartProducts.length, focusedProductIndex]);

  // Handle bottom button actions

  // const handleBottomXClick = () => {
  //   if (focusedProductIndex >= 0) {
  //     const product = cartProducts[focusedProductIndex];
  //     removeProduct(product.id);
  //     setFocusedProductIndex((prev) =>
  //       prev >= cartProducts.length - 1 ? cartProducts.length - 2 : prev,
  //     );
  //   }
  // };

  const handleBottomUpClick = () => {
    if (cartProducts.length === 0) return;
    setFocusedProductIndex((prev) =>
      prev <= 0 ? cartProducts.length - 1 : prev - 1,
    );
  };

  const handleBottomDownClick = () => {
    if (cartProducts.length === 0) return;
    setFocusedProductIndex((prev) =>
      prev >= cartProducts.length - 1 ? 0 : prev + 1,
    );
  };

  return (
    <div
      className={`flex h-screen bg-gray-50 ${isFullscreenMode ? "overflow-hidden" : ""}`}
    >
      {/* Left Panel */}
      <div className="flex-1 flex flex-col bg-white min-w-0">
        {/* Session Tabs */}
        <div className="bg-white px-6 pt-4 border-b border-gray-200">
          <div
            className="flex space-x-2 mb-4 overflow-x-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {sessions.map((session, index) => (
              <div
                key={session.id}
                className={`relative group rounded-t-lg flex-shrink-0 min-w-max ${
                  index === currentSessionIndex
                    ? "bg-blue-500"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                <button
                  onClick={() => switchToSession(index)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors w-full text-left whitespace-nowrap ${
                    index === currentSessionIndex
                      ? "text-white"
                      : "text-gray-600"
                  }`}
                >
                  {session.name}
                  {session.products.length > 0 && (
                    <span className="ml-2 bg-white bg-opacity-30 text-xs px-1.5 py-0.5 rounded-full">
                      {session.products.length}
                    </span>
                  )}
                  {session.products.length > 0 && (
                    <div className="text-xs opacity-75 mt-0.5">
                      {session.products
                        .reduce((sum, product) => sum + product.total, 0)
                        .toLocaleString()}{" "}
                      сум
                    </div>
                  )}
                </button>
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => closeSession(index, e)}
                    className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-100 transition-all ${
                      index === currentSessionIndex
                        ? "bg-red-500 text-white hover:bg-red-600 shadow-lg"
                        : "bg-gray-500 text-white hover:bg-gray-600 shadow-md"
                    }`}
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Product Header */}
          <div className="mb-6 px-6 pt-6">
            <h2 className="text-3xl font-bold mb-2 text-gray-900">
              {cartProducts.length > 0
                ? `${cartProducts.length} товар(ов) в корзине`
                : "Корзина пуста"}
            </h2>
            <div className="text-xl text-gray-700 font-medium">
              Общая сумма: {total.toLocaleString()} сум
            </div>

            {/* User Selection Display */}
            {(selectedSeller || selectedClient) && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <UserIcon className="w-5 h-5 text-blue-600" />
                    <div className="text-sm">
                      {selectedSeller && (
                        <span className="text-blue-700 font-medium">
                          Продавец:{" "}
                          {users.find((u) => u.id === selectedSeller)?.name ||
                            (selectedSeller === currentUser?.id
                              ? currentUser?.name
                              : `ID: ${selectedSeller} (не найден)`)}
                        </span>
                      )}
                      {selectedSeller && selectedClient && (
                        <span className="text-gray-400 mx-2">•</span>
                      )}
                      {selectedClient && (
                        <span className="text-blue-700 font-medium">
                          Клиент:{" "}
                          {clients.find((c) => c.id === selectedClient)?.name}
                          {onCredit && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                              В кредит
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSeller(null);
                      setSelectedClient(null);
                      setOnCredit(false);
                      setClientSearchTerm("");
                      setDebtDeposit("");
                      setDebtDueDate("");
                      setDepositPaymentMethod("Наличные");
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Очистить выбор"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Debug Mode Display */}
          {debugMode && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
              <div className="text-sm font-bold text-yellow-800 mb-2">
                🔧 DEBUG MODE ACTIVE (Ctrl+D to toggle)
              </div>
              <div className="space-y-1 text-xs text-yellow-700 font-mono">
                <div>
                  Barcode Input Focus:{" "}
                  {document.activeElement === barcodeInputRef.current
                    ? "✅ YES"
                    : "❌ NO"}
                </div>
                <div>Current Input: "{barcodeScanInput}"</div>
                <div>Last Scanned: "{lastScannedBarcode}"</div>
                <div>Processing: {isProcessingBarcode ? "YES" : "NO"}</div>
                <div className="text-yellow-600 mt-2">
                  Open console (F12) to see detailed logs
                </div>
                <div className="text-xs text-yellow-600 mt-1">
                  Try: 1) Type any number 2) Press Enter 3) Check console
                </div>
              </div>
            </div>
          )}

          {/* Barcode Display */}
          {(barcodeScanInput || isProcessingBarcode) && (
            <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-lg animate-pulse">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-blue-600 font-medium">
                  {isProcessingBarcode ? "Обработка:" : "Сканирование:"}
                </span>
                <span className="text-sm text-blue-900 font-mono">
                  {barcodeScanInput || "..."}
                </span>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          <div
            className={`flex space-x-4 ${isFullscreenMode ? "px-4 mb-3" : "px-6 mb-4"}`}
          >
            <div className="flex-1 bg-gray-100 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <div className="text-gray-600 text-sm font-medium">Карта</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-600 text-sm mb-0.5 font-medium">Итого</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {total.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 bg-gray-100 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <div className="text-gray-600 text-sm font-medium">Скидка</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-600 text-sm mb-0.5 font-medium">К оплате</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {total.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Product Table */}
          <div
            className={`flex flex-col flex-1 ${isFullscreenMode ? "p-4" : "p-6"} min-h-0`}
          >
            {/* Barcode Scanner Input - Positioned off-screen but still focusable */}
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeScanInput}
              onChange={handleBarcodeInputChange}
              onKeyPress={handleBarcodeKeyPress}
              onKeyDown={(e) => {
                if (debugMode) {
                  console.log("🔽 KeyDown in barcode input:", {
                    key: e.key,
                    code: e.code,
                    keyCode: e.keyCode,
                    isEnter: e.key === "Enter" || e.keyCode === 13,
                    currentValue: barcodeScanInput,
                  });
                }
                // Also handle Enter in keydown as some scanners might not trigger keypress
                if (e.key === "Enter" || e.keyCode === 13) {
                  e.preventDefault();
                  console.log(
                    "✅ ENTER in KeyDown! Processing:",
                    barcodeScanInput,
                  );
                  setLastScannedBarcode(barcodeScanInput);
                  processBarcodeInput(barcodeScanInput);
                }
              }}
              onKeyUp={(e) => {
                if (debugMode) {
                  console.log("🔼 KeyUp in barcode input:", {
                    key: e.key,
                    code: e.code,
                    keyCode: e.keyCode,
                  });
                }
              }}
              onInput={(e) => {
                if (debugMode) {
                  console.log("📥 Input event:", {
                    value: (e.target as HTMLInputElement).value,
                    inputType: (e as any).inputType,
                    data: (e as any).data,
                  });
                }
              }}
              onBlur={(_e) => {
                // Prevent losing focus unless we're in a modal
                setTimeout(() => {
                  if (
                    barcodeInputRef.current &&
                    !isPriceModalOpen &&
                    !isQuantityModalOpen &&
                    !isSearchModalOpen &&
                    !isPaymentModalOpen &&
                    !isUserModalOpen
                  ) {
                    if (debugMode) {
                      console.log("Input lost focus, refocusing...");
                    }
                    barcodeInputRef.current.focus();
                  }
                }, 10);
              }}
              onFocus={() => {
                if (debugMode) {
                  console.log("Barcode input gained focus");
                }
              }}
              style={{
                position: "absolute",
                left: "-9999px",
                width: "1px",
                height: "1px",
              }}
              autoFocus
              autoComplete="off"
              placeholder="Barcode scanner input"
            />

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div
                ref={tableRef}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col flex-1 min-h-0"
              >
                {/* Table Header - Fixed */}
                <div className="flex-shrink-0">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left p-3 font-bold text-gray-700 text-base">
                          №
                        </th>
                        <th className="text-left p-3 font-bold text-gray-700 text-base">
                          Товар
                        </th>
                        <th className="text-right p-3 font-bold text-gray-700 text-base">
                          Цена
                        </th>
                        <th className="text-center p-3 font-bold text-gray-700 text-base">
                          Ед. изм.
                        </th>
                        <th className="text-right p-3 font-bold text-gray-700 text-base">
                          Кол-во
                        </th>
                        <th className="text-right p-3 font-bold text-gray-700 text-base">
                          Сумма
                        </th>
                        <th className="text-center p-3 font-bold text-gray-700 text-base w-20">
                          Действия
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Scrollable Table Body */}
                <div className="overflow-y-auto overflow-x-hidden flex-1">
                  <table className="w-full">
                    <tbody>
                      {cartProducts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-8 text-center text-gray-500"
                          >
                            <div className="flex flex-col items-center space-y-2">
                              <Search className="w-12 h-12 text-gray-300" />
                              <span>Добавьте товары в корзину</span>
                              <span className="text-sm">
                                Нажмите на синюю кнопку поиска чтобы найти
                                товары
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        cartProducts.map((product, index) => (
                          <tr
                            key={product.id}
                            className={`${
                              index === focusedProductIndex
                                ? "bg-blue-100 border-l-4 border-blue-500"
                                : index % 2 === 0
                                  ? "bg-gray-50"
                                  : "bg-white"
                            } transition-all duration-200 hover:bg-gray-100`}
                          >
                            <td className="p-3 text-gray-900 text-sm font-medium">{index + 1}</td>
                            <td className="p-3 font-medium text-gray-900">
                              <div>
                                <div className="text-sm">{product.name}</div>
                                {product.barcode && (
                                  <div className="text-sm text-gray-500">
                                    Штрихкод: {product.barcode}
                                  </div>
                                )}
                                {product.product.ikpu && (
                                  <div className="text-sm text-gray-500">
                                    ИКПУ: {product.product.ikpu}
                                  </div>
                                )}
                                <div className="text-sm text-green-600 font-medium">
                                  В наличии:{" "}
                                  {parseFloat(
                                    String(product.product.quantity),
                                  ).toFixed(2)}{" "}
                                  {product.selectedUnit?.short_name || "шт"}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-right text-gray-900">
                              <button
                                onClick={() => {
                                  setSelectedProductForPrice(product);
                                  setSelectedProductIndexForPrice(index);
                                  setPriceInput(product.price.toString());
                                  setIsPriceModalOpen(true);
                                }}
                                className="w-24 text-right px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                              >
                                {product.price.toLocaleString()}
                              </button>
                            </td>
                            <td className="p-3 text-center text-gray-900">
                              {product.product.available_units &&
                              product.product.available_units.length > 0 ? (
                                <Select
                                  value={
                                    product.selectedUnit?.id?.toString() || ""
                                  }
                                  onValueChange={(value) => {
                                    const unitId = Number(value);
                                    const selectedUnit =
                                      product.product.available_units?.find(
                                        (u) => u.id === unitId,
                                      );
                                    if (selectedUnit) {
                                      const updatedProducts = cartProducts.map(
                                        (p) =>
                                          p.id === product.id
                                            ? { ...p, selectedUnit }
                                            : p,
                                      );
                                      setCartProducts(updatedProducts);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-20 text-xs">
                                    <SelectValue placeholder="Ед." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {product.product.available_units.map(
                                      (unit) => (
                                        <SelectItem
                                          key={unit.id}
                                          value={unit.id.toString()}
                                        >
                                          {unit.short_name}
                                          {unit.is_base && " (осн.)"}
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  {product.selectedUnit?.short_name || "шт"}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right text-gray-900">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => {
                                    const newQuantity = product.quantity - 1;
                                    if (newQuantity > 0) {
                                      updateProductQuantity(
                                        product.id,
                                        newQuantity,
                                        index,
                                      );
                                    }
                                  }}
                                  disabled={product.quantity <= 1}
                                  className={`w-10 h-10 rounded-full ${
                                    index === focusedProductIndex
                                      ? "bg-blue-200 hover:bg-blue-300 text-blue-800"
                                      : "bg-gray-200 hover:bg-gray-300"
                                  } ${product.quantity <= 1 ? "opacity-50 cursor-not-allowed" : ""} flex items-center justify-center text-base font-bold transition-colors`}
                                >
                                  −
                                </button>
                                <button
                                  onClick={() => handleQuantityClick(product, index)}
                                  className={`min-w-[80px] min-h-[40px] text-center border rounded-lg px-3 py-2 text-lg font-semibold transition-all ${
                                    index === focusedProductIndex
                                      ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                      : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50"
                                  } focus:outline-none focus:ring-2 focus:ring-blue-200`}
                                >
                                  {product.quantity.toFixed(2)}
                                </button>
                                <button
                                  onClick={() =>
                                    updateProductQuantity(
                                      product.id,
                                      product.quantity + 1,
                                      index,
                                    )
                                  }
                                  disabled={
                                    product.quantity >=
                                    parseFloat(String(product.product.quantity))
                                  }
                                  className={`w-10 h-10 rounded-full ${
                                    index === focusedProductIndex
                                      ? "bg-blue-200 hover:bg-blue-300 text-blue-800"
                                      : "bg-gray-200 hover:bg-gray-300"
                                  } ${product.quantity >= parseFloat(String(product.product.quantity)) ? "opacity-50 cursor-not-allowed" : ""} flex items-center justify-center text-base font-bold transition-colors`}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right font-bold text-gray-900 text-sm">
                              {product.total.toLocaleString()}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => {
                                  removeProduct(product.id);
                                  if (index === focusedProductIndex) {
                                    setFocusedProductIndex((prev) =>
                                      prev >= cartProducts.length - 1
                                        ? cartProducts.length - 2
                                        : prev,
                                    );
                                  }
                                }}
                                className={`w-10 h-10 rounded-full ${
                                  index === focusedProductIndex
                                    ? "bg-red-200 hover:bg-red-300 text-red-700 ring-2 ring-red-400"
                                    : "bg-red-100 hover:bg-red-200 text-red-600"
                                } flex items-center justify-center transition-all`}
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Page indicator */}
              <div className="flex items-center justify-between text-sm text-gray-500 mt-4 flex-shrink-0">
                <span>Товаров в корзине: {cartProducts.length}</span>
                <button
                  onClick={clearCart}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm font-medium transition-colors"
                  disabled={cartProducts.length === 0}
                >
                  Очистить корзину
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons at Bottom */}
          <div className="bg-white p-6 border-t border-gray-200">
            <div className="flex items-center space-x-2 justify-center">
              <button
                onClick={handleSearchClick}
                className="bg-blue-500 text-white p-4 rounded-xl hover:bg-blue-600 transition-colors flex items-center justify-center min-w-[60px] min-h-[60px] relative"
                title="Поиск товаров"
              >
                <Search className="w-6 h-6" />
                <span className="text-sm bg-blue-400 text-white px-2 py-1 rounded absolute -top-1 -right-1">
                  B
                </span>
              </button>
              <button
                onClick={handleUserClick}
                className={`p-4 rounded-xl transition-colors flex items-center justify-center relative min-w-[60px] min-h-[60px] ${
                  selectedSeller || selectedClient
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "bg-green-500 text-white hover:bg-green-600"
                }`}
                title="Выбор пользователя"
              >
                <UserIcon className="w-6 h-6" />
                {(selectedSeller || selectedClient) && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>
                )}
              </button>

              <button
                onClick={createNewSession}
                className="bg-purple-500 text-white p-4 rounded-xl hover:bg-purple-600 transition-colors flex items-center justify-center min-w-[60px] min-h-[60px]"
                title="Новая сессия"
              >
                <Plus className="w-6 h-6" />
              </button>

              {/* Calculator Toggle Button - Only show when calculator is hidden */}
              {!isCalculatorVisible && (
                <button
                  onClick={() => setIsCalculatorVisible(true)}
                  className="bg-gray-500 text-white p-4 rounded-xl hover:bg-gray-600 transition-colors flex items-center justify-center min-w-[60px] min-h-[60px]"
                  title="Показать калькулятор"
                >
                  <span className="text-xl font-bold">=</span>
                </button>
              )}

              {/* Payment Button - Show when calculator is hidden */}
              {!isCalculatorVisible && (
                <button
                  onClick={() => {
                    setDiscountAmount(0);
                    setPaymentMethods([
                      { amount: 0, payment_method: "Наличные" },
                    ]);
                    setIsPaymentModalOpen(true);
                  }}
                  disabled={cartProducts.length === 0}
                  className={`py-4 px-6 rounded-xl text-lg font-bold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[60px] active:scale-95 touch-manipulation ${
                    onCredit
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                  title={cartProducts.length === 0 ? "Добавьте товары" : onCredit ? `В долг ${total.toLocaleString()} сум` : `Оплатить ${total.toLocaleString()} сум`}
                >
                  {cartProducts.length === 0
                    ? "Товары"
                    : `${onCredit ? "Долг" : "Оплата"}: ${total.toLocaleString()}`}
                </button>
              )}

              <button
                onClick={handleBottomDownClick}
                disabled={cartProducts.length === 0}
                className="bg-indigo-500 text-white p-4 rounded-xl hover:bg-indigo-600 transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed min-w-[60px] min-h-[60px]"
                title="Вниз по списку"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
              <button
                onClick={handleBottomUpClick}
                disabled={cartProducts.length === 0}
                className="bg-teal-500 text-white p-4 rounded-xl hover:bg-teal-600 transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed min-w-[60px] min-h-[60px]"
                title="Вверх по списку"
              >
                <ChevronUp className="w-6 h-6" />
              </button>

              {/* Fullscreen Toggle Button */}
              {!isFullscreenMode ? (
                <button
                  onClick={() => {
                    navigate("/pos-fullscreen");
                  }}
                  className="bg-orange-500 text-white p-4 rounded-xl hover:bg-orange-600 transition-colors flex items-center justify-center min-w-[60px] min-h-[60px]"
                  title="Полноэкранный режим"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => {
                    navigate("/pos");
                  }}
                  className="bg-orange-500 text-white p-4 rounded-xl hover:bg-orange-600 transition-colors flex items-center justify-center min-w-[60px] min-h-[60px]"
                  title="Выйти из полноэкранного режима"
                >
                  <X className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Calculator */}
      {isCalculatorVisible && (
        <div className="w-96 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col h-full">
          {/* Calculator Display */}
          <div className="p-3 border-b border-gray-200 flex-shrink-0">
            {/* Calculator Header with Close Button */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-gray-900">
                Калькулятор
              </h3>
              <button
                onClick={() => setIsCalculatorVisible(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Закрыть калькулятор"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="bg-gray-100 p-3 rounded-lg mb-2">
              {operation && previousInput && (
                <div className="text-right text-lg text-gray-600 font-mono">
                  {previousInput} {operation}
                </div>
              )}
              <div className="text-right text-3xl font-mono text-gray-900">
                {currentInput || "0"}
              </div>
            </div>
          </div>

          {/* Calculator Keypad */}
          <div className="flex-1 p-2 overflow-y-auto">
            <div className="grid grid-cols-4 gap-2">
              {/* Row 1 */}
              <button
                onClick={handleClearInput}
                className="bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors h-12 flex items-center justify-center col-span-2 active:scale-95 touch-manipulation"
              >
                <span className="text-base font-bold text-orange-600">
                  Очистить
                </span>
              </button>
              <button
                onClick={handleBackspace}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-xl font-semibold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleOperation("/")}
                className="bg-blue-100 hover:bg-blue-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-blue-600 active:scale-95 touch-manipulation"
              >
                ÷
              </button>

              {/* Row 2 */}
              <button
                onClick={() => handleNumberClick("7")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                7
              </button>
              <button
                onClick={() => handleNumberClick("8")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                8
              </button>
              <button
                onClick={() => handleNumberClick("9")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                9
              </button>
              <button
                onClick={() => handleOperation("*")}
                className="bg-blue-100 hover:bg-blue-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-blue-600 active:scale-95 touch-manipulation"
              >
                ×
              </button>

              {/* Row 3 */}
              <button
                onClick={() => handleNumberClick("4")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                4
              </button>
              <button
                onClick={() => handleNumberClick("5")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                5
              </button>
              <button
                onClick={() => handleNumberClick("6")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                6
              </button>
              <button
                onClick={() => handleOperation("-")}
                className="bg-blue-100 hover:bg-blue-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-blue-600 active:scale-95 touch-manipulation"
              >
                −
              </button>

              {/* Row 4 */}
              <button
                onClick={() => handleNumberClick("1")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                1
              </button>
              <button
                onClick={() => handleNumberClick("2")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                2
              </button>
              <button
                onClick={() => handleNumberClick("3")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                3
              </button>
              <button
                onClick={() => handleOperation("+")}
                className="bg-blue-100 hover:bg-blue-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-blue-600 active:scale-95 touch-manipulation"
              >
                +
              </button>

              {/* Row 5 */}
              <button
                onClick={() => handleNumberClick("0")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 col-span-2 active:scale-95 touch-manipulation"
              >
                0
              </button>
              <button
                onClick={() => handleNumberClick(",")}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-bold transition-colors h-12 flex items-center justify-center text-gray-900 active:scale-95 touch-manipulation"
              >
                ,
              </button>
              <button
                onClick={handleEquals}
                className="bg-green-100 hover:bg-green-200 rounded-lg transition-colors h-12 flex items-center justify-center active:scale-95 touch-manipulation"
              >
                <span className="text-xl font-bold text-green-600">=</span>
              </button>
            </div>
          </div>

          {/* Payment Button */}
          <div className="p-3 border-t border-gray-200 flex-shrink-0 bg-white">
            <button
              onClick={() => {
                setDiscountAmount(0);
                setPaymentMethods([
                  { amount: 0, payment_method: "Наличные" },
                ]);
                setIsPaymentModalOpen(true);
              }}
              disabled={cartProducts.length === 0}
              className={`w-full py-4 rounded-lg text-lg font-bold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[64px] active:scale-95 touch-manipulation ${
                onCredit
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {cartProducts.length === 0
                ? "Добавьте товары"
                : onCredit
                  ? `В долг ${total.toLocaleString()} сум`
                  : `Оплатить ${total.toLocaleString()} сум`}
            </button>
          </div>
        </div>
      )}

      {/* Product Search Modal */}
      <WideDialog open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
        <WideDialogContent
          className="max-h-[90vh] overflow-hidden p-0"
          width="extra-wide"
        >
          <WideDialogHeader className="p-6 pb-4">
            <WideDialogTitle className="text-xl font-bold">
              Поиск товаров
            </WideDialogTitle>
          </WideDialogHeader>

          <div className="px-6 pb-4 space-y-4">
            {/* Search Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Name Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Поиск по названию товара..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={(e) => {
                    e.stopPropagation();
                  }}
                  onBlur={(e) => {
                    e.stopPropagation();
                  }}
                  className="w-full pl-14 pr-6 py-4 text-lg border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              
              {/* Barcode Search */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Поиск по штрихкоду..."
                  value={barcodeSearchTerm}
                  onChange={(e) => setBarcodeSearchTerm(e.target.value)}
                  onFocus={(e) => {
                    e.stopPropagation();
                  }}
                  onBlur={(e) => {
                    e.stopPropagation();
                  }}
                  className="w-full pl-14 pr-6 py-4 text-lg border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Selection info and controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {selectedProducts.size > 0 && (
                  <>
                    <span className="text-sm text-gray-600">
                      Выбрано: {selectedProducts.size} товар(ов)
                    </span>
                    <button
                      onClick={handleSaveSelectedProducts}
                      className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-base font-medium transition-colors"
                    >
                      Добавить выбранные
                    </button>
                  </>
                )}
              </div>

              {selectedProducts.size > 0 && (
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedProducts(new Set())}
                    className="px-4 py-2 text-base bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Очистить
                  </button>
                  <button
                    onClick={handleSaveSelectedProducts}
                    className="px-6 py-2 text-base bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    Добавить в корзину ({selectedProducts.size})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Products Table */}
          <div className="flex-1 overflow-hidden">
            <div className="border-t border-gray-200 bg-gray-50 max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-100 sticky top-0 border-b border-gray-200">
                  <tr>
                    <th className="text-center p-4 font-semibold text-gray-700 w-16">
                      <input
                        type="checkbox"
                        checked={
                          filteredProducts.length > 0 &&
                          filteredProducts.every((product) =>
                            selectedProducts.has(product.id!),
                          )
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProducts(
                              new Set(filteredProducts.map((p) => p.id!)),
                            );
                          } else {
                            setSelectedProducts(new Set());
                          }
                        }}
                        onFocus={(e) => {
                          e.stopPropagation();
                        }}
                        onBlur={(e) => {
                          e.stopPropagation();
                        }}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left p-4 font-semibold text-gray-700 w-16">
                      №
                    </th>
                    <th className="text-left p-4 font-semibold text-gray-700">
                      Наименование товара
                    </th>
                    <th className="text-center p-4 font-semibold text-gray-700">
                      ИКПУ
                    </th>
                    <th className="text-center p-4 font-semibold text-gray-700">
                      Штрихкод
                    </th>
                    {currentUser?.can_view_quantity !== false && (
                      <th className="text-right p-4 font-semibold text-gray-700">
                        Количество
                      </th>
                    )}
                    <th className="text-right p-4 font-semibold text-gray-700">
                      Цена
                    </th>
                    <th className="text-center p-4 font-semibold text-gray-700 w-24">
                      •••
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingProducts ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-gray-500">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                          <span>Загрузка товаров...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-gray-500">
                        {searchTerm
                          ? "Товары не найдены"
                          : "Начните ввод для поиска товаров"}
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product:any, index) => (
                      <tr
                        key={product.id}
                        className={`${
                          index % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } ${selectedProducts.has(product.id!) ? "bg-blue-100" : ""} ${parseFloat(String(product.quantity || 0)) <= 0 ? "opacity-50" : ""} hover:bg-blue-50 transition-colors border-b border-gray-100`}
                      >
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id!)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleProductSelect(product);
                            }}
                            onFocus={(e) => {
                              e.stopPropagation();
                            }}
                            onBlur={(e) => {
                              e.stopPropagation();
                            }}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </td>
                        <td className="p-4 text-gray-900 font-medium">
                          {index + 1}
                        </td>
                        <td
                          className="p-4 cursor-pointer"
                          onClick={() => handleProductSelect(product)}
                        >
                          <div>
                            <div className="font-medium text-gray-900 text-sm hover:text-blue-600 transition-colors">
                              {product.product_name || "N/A"}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {product.barcode && (
                                <span>Штрихкод: {product.barcode} </span>
                              )}
                              {product.ikpu && (
                                <span className="ml-2">
                                  ИКПУ: {product.ikpu}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-center text-gray-600 font-mono text-sm">
                          {product.ikpu || "—"}
                        </td>
                        <td className="p-4 text-center text-gray-600 font-mono text-sm">
                          {product.barcode || "—"}
                        </td>
                        {currentUser?.can_view_quantity !== false && (
                          <td className="p-4 text-right">
                            <div
                              className={`font-semibold ${parseFloat(String(product.quantity || 0)) <= 0 ? "text-red-500" : "text-gray-900"}`}
                            >
                              {(
                                parseFloat(String(product.quantity || 0)) +
                                parseFloat(String(product.extra_quantity || 0))
                              ).toLocaleString()}
                            </div>
                          </td>
                        )}
                        <td className="p-4 text-right">
                          <div className="text-gray-900 font-semibold">
                            {product.selling_price
                              ? parseFloat(
                                  String(product.selling_price),
                                ).toLocaleString()
                              : product.min_price
                                ? parseFloat(
                                    String(product.min_price),
                                  ).toLocaleString()
                                : "—"}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <Button
                            size="lg"
                            variant="ghost"
                            className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductSelect(product);
                            }}
                          >
                            Добавить
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </WideDialogContent>
      </WideDialog>

      {/* User Selection Modal */}
      <WideDialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <WideDialogContent className="max-h-[90vh] overflow-hidden p-0">
          <WideDialogHeader className="p-6 pb-4">
            <WideDialogTitle className="text-xl font-bold">
              Выбор пользователя для долга
            </WideDialogTitle>
          </WideDialogHeader>

          <div className="p-6 space-y-6">
            {/* Seller Selection - Only for admin/superuser */}
            {(isAdmin || isSuperUser) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Продавец
                </label>
                <Select
                  value={selectedSeller?.toString() || ""}
                  onValueChange={(value) =>
                    setSelectedSeller(parseInt(value, 10))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите продавца" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter((user) => {
                        const extendedUser = user as ExtendedUser;
                        return (
                          (user.role === "Продавец" ||
                            user.role === "Администратор") &&
                          extendedUser.store_read
                        );
                      })
                      .map((user) => (
                        <SelectItem
                          key={user.id}
                          value={user.id?.toString() || ""}
                        >
                          {user.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Credit Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                В кредит
              </label>
              <Select
                value={onCredit ? "true" : "false"}
                onValueChange={(value) => {
                  const isCredit = value === "true";
                  setOnCredit(isCredit);
                  if (!isCredit) {
                    setSelectedClient(null);
                    setDebtDeposit("");
                    setDebtDueDate("");
                    setDepositPaymentMethod("Наличные");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Да</SelectItem>
                  <SelectItem value="false">Нет</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Client Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Клиент
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateClientModalOpen(true)}
                  className="h-8 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Создать клиента
                </Button>
              </div>
              <Input
                type="text"
                placeholder="Поиск клиентов..."
                value={clientSearchTerm}
                onChange={(e) => setClientSearchTerm(e.target.value)}
                onFocus={(e) => {
                  e.stopPropagation();
                }}
                onBlur={(e) => {
                  e.stopPropagation();
                }}
                className="mb-2"
                autoComplete="off"
              />
              <Select
                value={selectedClient?.toString() || ""}
                onValueChange={(value) =>
                  setSelectedClient(parseInt(value, 10))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите клиента" />
                </SelectTrigger>
                <SelectContent>
                  <div className="max-h-[200px] overflow-y-auto">
                    {clients && clients.length > 0 ? (
                      clients
                        .filter(
                          (client) =>
                            (onCredit ? true : client.type === "Юр.лицо") &&
                            client.name
                              .toLowerCase()
                              .includes(clientSearchTerm.toLowerCase()),
                        )
                        .map((client) => (
                          <SelectItem
                            key={client.id}
                            value={client.id?.toString() || ""}
                          >
                            {client.name}{" "}
                            {client.type !== "Юр.лицо" && `(${client.type})`}
                          </SelectItem>
                        ))
                    ) : (
                      <div className="p-2 text-center text-gray-500 text-sm">
                        Клиенты не найдены
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>

            {/* Debt specific fields - shown only when onCredit is true */}
            {onCredit && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Сумма залога (сум)
                  </label>
                  <Input
                    type="number"
                    placeholder="Введите сумму залога..."
                    value={debtDeposit}
                    onChange={(e) => setDebtDeposit(e.target.value)}
                    onFocus={(e) => {
                      e.stopPropagation();
                    }}
                    onBlur={(e) => {
                      e.stopPropagation();
                    }}
                    className="mb-2"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Способ оплаты залога
                  </label>
                  <select
                    value={depositPaymentMethod}
                    onChange={(e) => setDepositPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Наличные">Наличные</option>
                    <option value="Карта">Карта</option>
                    <option value="Click">Click</option>
                    <option value="Перечисление">Перечисление</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Срок погашения
                  </label>
                  <Input
                    type="date"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    onFocus={(e) => {
                      e.stopPropagation();
                    }}
                    onBlur={(e) => {
                      e.stopPropagation();
                    }}
                    className="mb-2"
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            {/* Current Selection Display */}
            {(selectedSeller || selectedClient) && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">
                  Текущий выбор:
                </h4>
                {selectedSeller && (
                  <p className="text-sm text-blue-700">
                    <strong>Продавец:</strong>{" "}
                    {users.find((u) => u.id === selectedSeller)?.name ||
                      (selectedSeller === currentUser?.id
                        ? currentUser?.name
                        : `ID: ${selectedSeller}`)}
                  </p>
                )}
                {selectedClient && (
                  <>
                    <p className="text-sm text-blue-700">
                      <strong>Клиент:</strong>{" "}
                      {clients.find((c) => c.id === selectedClient)?.name}
                      {onCredit && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                          В кредит
                        </span>
                      )}
                    </p>
                    {onCredit && (debtDeposit || debtDueDate) && (
                      <div className="text-sm text-blue-700 mt-1">
                        {debtDeposit && (
                          <p>
                            <strong>Залог:</strong>{" "}
                            {parseInt(debtDeposit).toLocaleString()} сум
                          </p>
                        )}
                        {debtDueDate && (
                          <p>
                            <strong>Срок:</strong>{" "}
                            {new Date(debtDueDate).toLocaleDateString("ru-RU")}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <Button
                onClick={() => {
                  // Reset selections
                  setSelectedSeller(null);
                  setSelectedClient(null);
                  setOnCredit(false);
                  setClientSearchTerm("");
                  setDebtDeposit("");
                  setDebtDueDate("");
                  setDepositPaymentMethod("Наличные");
                }}
                variant="outline"
                className="flex-1"
              >
                Очистить
              </Button>
              <Button
                onClick={() => setIsUserModalOpen(false)}
                className="flex-1"
              >
                Готово
              </Button>
            </div>
          </div>
        </WideDialogContent>
      </WideDialog>

      {/* Quantity Selection Modal */}
      <WideDialog
        open={isQuantityModalOpen}
        onOpenChange={setIsQuantityModalOpen}
      >
        <WideDialogContent className="max-w-md p-0">
          <WideDialogHeader className="p-6 pb-4">
            <WideDialogTitle className="text-xl font-bold text-center">
              Выберите количество
            </WideDialogTitle>
            {selectedProductForQuantity && (
              <div className="text-center mt-2">
                <p className="text-sm text-gray-600">
                  {selectedProductForQuantity.name}
                </p>
                <p className="text-xs text-green-600 font-medium mt-1">
                  В наличии:{" "}
                  {parseFloat(
                    String(selectedProductForQuantity.product.quantity),
                  ).toFixed(2)}{" "}
                  {selectedProductForQuantity.selectedUnit?.short_name || "шт"}
                </p>
                {selectedProductForQuantity.product.barcode && (
                  <p className="text-xs text-gray-500">
                    Штрихкод: {selectedProductForQuantity.product.barcode}
                  </p>
                )}
                {selectedProductForQuantity.product.ikpu && (
                  <p className="text-xs text-gray-500">
                    ИКПУ: {selectedProductForQuantity.product.ikpu}
                  </p>
                )}
              </div>
            )}
          </WideDialogHeader>

          <div className="p-6 pt-2">
            {!isManualQuantityMode ? (
              <>
                {/* Preset Quantity Cards */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[5, 10, 15, 20, 25, 30].map((qty) => {
                    const availableQty = selectedProductForQuantity?.product
                      .quantity
                      ? parseFloat(
                          String(selectedProductForQuantity.product.quantity),
                        )
                      : 0;
                    const isDisabled = qty > availableQty;
                    return (
                      <button
                        key={qty}
                        onClick={() => !isDisabled && handleQuantitySelect(qty)}
                        disabled={isDisabled}
                        className={`border-2 rounded-2xl p-8 transition-all duration-200 min-h-[120px] touch-manipulation ${
                          isDisabled
                            ? "bg-gray-100 border-gray-300 opacity-40 cursor-not-allowed"
                            : "bg-blue-50 hover:bg-blue-100 border-blue-200 hover:border-blue-400 transform hover:scale-105 active:scale-95"
                        }`}
                      >
                        <div
                          className={`text-4xl font-bold mb-2 ${isDisabled ? "text-gray-400" : "text-blue-700"}`}
                        >
                          {qty}
                        </div>
                        <div
                          className={`text-base font-medium ${isDisabled ? "text-gray-400" : "text-blue-600"}`}
                        >
                          {selectedProductForQuantity?.selectedUnit
                            ?.short_name || "штук"}
                        </div>
                        {isDisabled && (
                          <div className="text-xs text-red-500 mt-1">
                            Нет в наличии
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Current Quantity Display */}
                {selectedProductForQuantity && (
                  <div className="bg-gray-50 rounded-xl p-5 mb-4">
                    <div className="text-center">
                      <div className="text-base text-gray-600 mb-2 font-medium">
                        Текущее количество
                      </div>
                      <div className="text-3xl font-bold text-gray-900">
                        {selectedProductForQuantity.quantity.toFixed(2)}{" "}
                        {selectedProductForQuantity.selectedUnit?.short_name ||
                          "штук"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-4">
                  <button
                    onClick={() => setIsQuantityModalOpen(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleManualQuantityMode}
                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
                  >
                    Ввести вручную
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Manual Input Mode */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Введите количество
                  </label>
                  <input
                    type="number"
                    value={manualQuantityInput}
                    onChange={(e) => setManualQuantityInput(e.target.value)}
                    onFocus={(e) => {
                      e.stopPropagation();
                    }}
                    onBlur={(e) => {
                      e.stopPropagation();
                    }}
                    className={`w-full px-4 py-4 text-2xl text-center border-2 rounded-xl focus:outline-none ${
                      manualQuantityInput &&
                      parseFloat(manualQuantityInput) >
                        parseFloat(
                          String(
                            selectedProductForQuantity?.product.quantity || 0,
                          ),
                        )
                        ? "border-red-500 focus:border-red-600"
                        : "border-gray-300 focus:border-blue-500"
                    }`}
                    placeholder="0"
                    autoFocus
                    min="0.01"
                    step="0.1"
                  />
                  {manualQuantityInput &&
                    parseFloat(manualQuantityInput) >
                      parseFloat(
                        String(
                          selectedProductForQuantity?.product.quantity || 0,
                        ),
                      ) && (
                      <p className="text-red-500 text-sm mt-2 text-center">
                        Превышает доступное количество
                      </p>
                    )}
                  {selectedProductForQuantity && (
                    <p className="text-gray-500 text-sm mt-2 text-center">
                      Доступно:{" "}
                      {parseFloat(
                        String(selectedProductForQuantity.product.quantity),
                      ).toFixed(2)}{" "}
                      {selectedProductForQuantity.selectedUnit?.short_name ||
                        "шт"}
                    </p>
                  )}
                </div>

                {/* Manual Input Action Buttons */}
                <div className="flex space-x-4">
                  <button
                    onClick={() => setIsManualQuantityMode(false)}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
                  >
                    Назад
                  </button>
                  <button
                    onClick={handleManualQuantitySubmit}
                    disabled={
                      !manualQuantityInput ||
                      parseFloat(manualQuantityInput) <= 0 ||
                      parseFloat(manualQuantityInput) >
                        parseFloat(
                          String(
                            selectedProductForQuantity?.product.quantity || 0,
                          ),
                        )
                    }
                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
                  >
                    Применить
                  </button>
                </div>
              </>
            )}
          </div>
        </WideDialogContent>
      </WideDialog>

      {/* Price Input Modal */}
      <WideDialog open={isPriceModalOpen} onOpenChange={setIsPriceModalOpen}>
        <WideDialogContent className="max-w-md p-0">
          <WideDialogHeader className="p-6 pb-4">
            <WideDialogTitle className="text-xl font-bold text-center">
              Введите цену
            </WideDialogTitle>
            {selectedProductForPrice && (
              <div className="text-center mt-2">
                <p className="text-sm text-gray-600">
                  {selectedProductForPrice.name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Количество: {selectedProductForPrice.quantity.toFixed(2)}{" "}
                  {selectedProductForPrice.selectedUnit?.short_name || "шт"}
                </p>
              </div>
            )}
          </WideDialogHeader>

          <div className="p-6 pt-2">
            {/* Price Display */}
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-2">
                  Цена за единицу
                </div>
                <div className="text-4xl font-bold text-gray-900 min-h-[3rem] flex items-center justify-center">
                  {priceInput || "0"}
                </div>
                {selectedProductForPrice && priceInput && (
                  <div className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-200">
                    Итого:{" "}
                    {new Intl.NumberFormat("ru-RU", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    }).format(
                      parseFloat(priceInput) * selectedProductForPrice.quantity,
                    )}{" "}
                    сум
                  </div>
                )}
              </div>
            </div>

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map(
                (btn) => (
                  <button
                    key={btn}
                    onClick={() => {
                      if (btn === "⌫") {
                        handlePriceBackspace();
                      } else {
                        handlePriceNumberClick(btn);
                      }
                    }}
                    className={`py-8 text-3xl font-bold rounded-xl transition-all min-h-[80px] ${
                      btn === "⌫"
                        ? "bg-red-100 hover:bg-red-200 text-red-600"
                        : "bg-blue-50 hover:bg-blue-100 text-blue-700"
                    } active:scale-95 touch-manipulation`}
                  >
                    {btn}
                  </button>
                ),
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={handlePriceClear}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
              >
                Очистить
              </button>
              <button
                onClick={() => {
                  setIsPriceModalOpen(false);
                  setSelectedProductForPrice(null);
                  setPriceInput("");
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
              >
                Отмена
              </button>
              <button
                onClick={handlePriceSubmit}
                disabled={!priceInput || parseFloat(priceInput) <= 0}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-5 rounded-xl text-lg font-bold transition-colors min-h-[70px] active:scale-95 touch-manipulation"
              >
                Применить
              </button>
            </div>
          </div>
        </WideDialogContent>
      </WideDialog>

      {/* Payment Modal */}
      <WideDialog
        open={isPaymentModalOpen}
        onOpenChange={setIsPaymentModalOpen}
      >
        <WideDialogContent className="max-w-4xl">
          <div className="p-8">
            {/* Header with Back Button and Pay Button */}
            <div className="flex items-center justify-between mb-8">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span className="text-2xl">←</span>
                <span className="text-lg">Назад</span>
                <span className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded">
                  B
                </span>
              </button>

              <button
                onClick={async () => {
                  // Validate payment total
                 
                 
                  // Validate debt fields when onCredit is true
                  if (onCredit && !selectedClient) {
                    toast.error("Выберите клиента для продажи в кредит!");
                    return;
                  }


                  if (onCredit && !debtDueDate) {
                    toast.error("Выберите срок погашения!");
                    return;
                  }

                  try {
                    setIsProcessingSale(true);

                    // Create your custom payload structure as specified
                    const customSalePayload: SalePayload = {
                      store: currentUser?.store_read?.id || 1,
                      sold_by: selectedSeller || currentUser?.id || 5,
                      on_credit: onCredit,
                      sale_items: cartProducts.map((item) => ({
                        product_write: item.productId,
                        quantity: item.quantity,
                        selling_unit:
                          item.selectedUnit?.id || item.product.base_unit || 1,
                        price_per_unit: item.price,
                      })),
                      sale_payments: paymentMethods.filter((p) => p.amount > 0),
                      ...(onCredit &&
                        selectedClient && {
                          sale_debt: {
                            client: selectedClient,
                            deposit: parseInt(debtDeposit || "0"),
                            due_date: debtDueDate,
                            deposit_payment_method:
                              depositPaymentMethod || "Наличные",
                          },
                        }),
                    };

                    // Also create API-compatible payload for backend
                    // @ts-ignore
                    // @ts-ignore
                    const saleApiPayload: Sale = {
                      store: currentUser?.store_read?.id || 1,
                      ...(selectedSeller && { sold_by: selectedSeller }),
                      payment_method:
                        paymentMethods[0]?.payment_method || "Наличные",
                      sale_items: cartProducts.map((item) => ({
                        product_write: item.productId,
                        selling_unit: item?.selectedUnit?.id,
                        quantity: item.quantity.toString(),
                        price_per_unit: item.price.toString(),
                        ...(item.stockId && { stock: item.stockId }),
                      })),
                      on_credit: onCredit,
                      total_amount: total.toFixed(2),
                      discount_amount: discountAmount.toFixed(2),
                      sale_payments: paymentMethods
                        .map((payment) => ({
                          payment_method: payment.payment_method,
                          amount: (payment.amount || (total - discountAmount)).toFixed(2),
                        }))
                        .filter((p) => Number(p.amount) > 0),
                      ...(onCredit &&
                        selectedClient && {
                          sale_debt: {
                            client: selectedClient,
                            deposit: debtDeposit,
                            due_date: debtDueDate,
                            deposit_payment_method:
                              depositPaymentMethod || "Наличные",
                          },
                        }),
                    };

                    console.log(
                      "Custom Sale Payload:",
                      JSON.stringify(customSalePayload, null, 2),
                    );
                    console.log(
                      "API Sale Payload:",
                      JSON.stringify(saleApiPayload, null, 2),
                    );

                    // Send to API using the API-compatible payload
                    const saleResponse =
                      await createSaleMutation.mutateAsync(saleApiPayload);

                    console.log("✅ Sale created successfully:", saleResponse);

                    // Automatically print receipt after successful sale
                    if (saleResponse) {
                      try {
                        const printResult =
                          await saleReceiptService.printWithFallback(
                            saleResponse as unknown as SaleData,
                          );
                        saleReceiptService.showPrintNotification(printResult);
                        console.log("🖨️ Receipt print result:", printResult);
                      } catch (printError) {
                        console.error(
                          "❌ Receipt printing failed:",
                          printError,
                        );
                        // Don't block the sale completion if printing fails
                        saleReceiptService.showPrintNotification({
                          success: false,
                          method: "failed",
                          message: "Не удалось напечатать чек",
                          error:
                            printError instanceof Error
                              ? printError.message
                              : "Unknown error",
                        });
                      }
                    }

                    // Clear cart and close modal
                    setCartProducts([]);
                    setIsPaymentModalOpen(false);
                    setPaymentMethods([
                      { amount: 0, payment_method: "Наличные" },
                    ]);

                    // Reset other states
                    setSelectedClient(null);
                    setSelectedSeller(null);
                    setOnCredit(false);

                    // Clear persisted state after successful sale
                    clearPersistedState();
                    setFocusedProductIndex(-1);

                    // Show success message
                    toast.success("Продажа успешно оформлена!");
                  } catch (error) {
                    console.error("Error creating sale:", error);
                    toast.error(
                      "Ошибка при оформлении продажи. Попробуйте еще раз.",
                    );
                  } finally {
                    setIsProcessingSale(false);
                  }
                }}
                disabled={
                  isProcessingSale ||
                  (paymentMethods.reduce((sum, p) => sum + (p.amount || (total - discountAmount)), 0) <
                      (total - discountAmount) &&
                    !onCredit)
                }
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-4 rounded-xl text-lg font-semibold flex items-center gap-2 transition-colors"
              >
                {isProcessingSale ? "Обработка..." : "Оплатить"}
                <span className="text-sm bg-blue-500 px-2 py-1 rounded">L</span>
              </button>
            </div>

            {/* Discount Input */}
            <div className="mb-8">
              <label className="block text-gray-700 text-lg font-medium mb-2">
                Скидка:
              </label>
              <input
                type="number"
                value={discountAmount || ""}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                onFocus={(e) => e.stopPropagation()}
                onBlur={(e) => e.stopPropagation()}
                placeholder="0"
                className="w-full text-3xl font-bold bg-gray-50 border-2 border-gray-300 rounded-xl p-4 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Payment Summary */}
            <div className="grid grid-cols-3 gap-8 mb-8">
              <div>
                <div className="text-gray-500 text-lg mb-2">Итого:</div>
                <div className="text-5xl font-bold text-gray-900">
                  {total.toLocaleString()} UZS
                </div>
              </div>
              <div>
                <div className="text-green-500 text-lg mb-2">К оплате:</div>
                <div className="text-5xl font-bold text-green-500">
                  {Math.max(
                    0,
                    (total - discountAmount) -
                      paymentMethods.reduce(
                        (sum, p) => sum + (p.amount || 0),
                        0,
                      ),
                  ).toLocaleString()}{" "}
                  UZS
                </div>
              </div>
              <div>
                <div className="text-blue-500 text-lg mb-2">СДАЧА:</div>
                <div className="text-5xl font-bold text-blue-500">
                  {(() => {
                    const totalPaid = paymentMethods.reduce((sum, p) => sum + (p.amount || 0), 0);
                    const finalTotal = total - discountAmount;
                    return totalPaid > finalTotal ? (totalPaid - finalTotal).toLocaleString() : "0";
                  })()}{" "}
                  UZS
                </div>
              </div>
            </div>

            {/* Payment Method Buttons */}
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => {
                  if (onCredit) return; // Disable when in credit mode
                  const hasNalichnye = paymentMethods.some(
                    (p) => p.payment_method === "Наличные",
                  );
                  if (!hasNalichnye) {
                    const totalPaid = paymentMethods.reduce(
                      (sum, p) => sum + (p.amount || 0),
                      0,
                    );
                    const remaining = (total - discountAmount) - totalPaid;
                    setPaymentMethods((prev) => [
                      ...prev,
                      {
                        amount: remaining > 0 ? remaining : 0,
                        payment_method: "Наличные",
                      },
                    ]);
                  }
                }}
                disabled={onCredit}
                className={`flex-1 border-2 rounded-xl p-4 flex items-center justify-center gap-3 transition-colors ${
                  onCredit 
                    ? "bg-gray-300 border-gray-400 cursor-not-allowed opacity-50" 
                    : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                }`}
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span className="text-gray-700 font-medium">Наличные</span>
                <span className="text-sm bg-gray-300 text-gray-600 px-2 py-1 rounded ml-auto">
                  F1
                </span>
              </button>

              <button
                onClick={() => {
                  if (onCredit) return; // Disable when in credit mode
                  const hasClick = paymentMethods.some(
                    (p) => p.payment_method === "Click",
                  );
                  if (!hasClick) {
                    const totalPaid = paymentMethods.reduce(
                      (sum, p) => sum + (p.amount || 0),
                      0,
                    );
                    const remaining = (total - discountAmount) - totalPaid;
                    setPaymentMethods((prev) => [
                      ...prev,
                      {
                        amount: remaining > 0 ? remaining : 0,
                        payment_method: "Click",
                      },
                    ]);
                  }
                }}
                disabled={onCredit}
                className={`flex-1 border-2 rounded-xl p-4 flex items-center justify-center gap-3 transition-colors ${
                  onCredit 
                    ? "bg-gray-300 border-gray-400 cursor-not-allowed opacity-50" 
                    : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                }`}
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-gray-700 font-medium">Click</span>
                <span className="text-sm bg-gray-300 text-gray-600 px-2 py-1 rounded ml-auto">
                  F2
                </span>
              </button>

              <button
                onClick={() => {
                  if (onCredit) return; // Disable when in credit mode
                  const hasKarta = paymentMethods.some(
                    (p) => p.payment_method === "Карта",
                  );
                  if (!hasKarta) {
                    const totalPaid = paymentMethods.reduce(
                      (sum, p) => sum + (p.amount || 0),
                      0,
                    );
                    const remaining = (total - discountAmount) - totalPaid;
                    setPaymentMethods((prev) => [
                      ...prev,
                      {
                        amount: remaining > 0 ? remaining : 0,
                        payment_method: "Карта",
                      },
                    ]);
                  }
                }}
                disabled={onCredit}
                className={`flex-1 border-2 rounded-xl p-4 flex items-center justify-center gap-3 transition-colors ${
                  onCredit 
                    ? "bg-gray-300 border-gray-400 cursor-not-allowed opacity-50" 
                    : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                }`}
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                <span className="text-gray-700 font-medium">Карта</span>
                <span className="text-sm bg-gray-300 text-gray-600 px-2 py-1 rounded ml-auto">
                  F3
                </span>
              </button>

              <button
                onClick={() => {
                  if (onCredit) return; // Disable when in credit mode
                  const hasPerechislenie = paymentMethods.some(
                    (p) => p.payment_method === "Перечисление",
                  );
                  if (!hasPerechislenie) {
                    const totalPaid = paymentMethods.reduce(
                      (sum, p) => sum + (p.amount || 0),
                      0,
                    );
                    const remaining = (total - discountAmount) - totalPaid;
                    setPaymentMethods((prev) => [
                      ...prev,
                      {
                        amount: remaining > 0 ? remaining : 0,
                        payment_method: "Перечисление",
                      },
                    ]);
                  }
                }}
                disabled={onCredit}
                className={`flex-1 border-2 rounded-xl p-4 flex items-center justify-center gap-3 transition-colors ${
                  onCredit 
                    ? "bg-gray-300 border-gray-400 cursor-not-allowed opacity-50" 
                    : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                }`}
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                <span className="text-gray-700 font-medium">Перечисление</span>
                <span className="text-sm bg-gray-300 text-gray-600 px-2 py-1 rounded ml-auto">
                  F4
                </span>
              </button>

              <button
                onClick={() => {
                  if (onCredit) return; // Disable when in credit mode
                  const totalPaid = paymentMethods.reduce(
                    (sum, p) => sum + (p.amount || 0),
                    0,
                  );
                  const remaining = (total - discountAmount) - totalPaid;
                  if (remaining > 0) {
                    setPaymentMethods((prev) => [
                      ...prev,
                      { amount: remaining, payment_method: "Наличные" },
                    ]);
                  }
                }}
                disabled={onCredit}
                className={`border-2 rounded-xl px-6 flex items-center justify-center transition-colors ${
                  onCredit 
                    ? "bg-gray-300 border-gray-400 cursor-not-allowed opacity-50" 
                    : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                }`}
              >
                <Plus className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Payment Method Cards */}
            <div className="grid grid-cols-3 gap-6">
              {paymentMethods.map((payment, index) => (
                <div
                  key={index}
                  className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200 relative"
                >
                  <button
                    onClick={() => {
                      if (onCredit) return;
                      if (paymentMethods.length > 1) {
                        setPaymentMethods((prev) =>
                          prev.filter((_, i) => i !== index),
                        );
                      }
                    }}
                    disabled={onCredit}
                    className={`absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                      onCredit 
                        ? "bg-gray-300 text-gray-400 cursor-not-allowed" 
                        : "bg-white hover:bg-red-50 text-red-500"
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="text-gray-700 font-semibold text-lg mb-4">
                    {payment.payment_method}
                  </div>

                  <input
                    type="number"
                    value={payment.amount || (total - discountAmount)}
                    onChange={(e) => {
                      if (onCredit) return;
                      const updated = [...paymentMethods];
                      updated[index].amount = Number(e.target.value);
                      setPaymentMethods(updated);
                    }}
                    onFocus={(e) => {
                      e.stopPropagation();
                    }}
                    onBlur={(e) => {
                      e.stopPropagation();
                    }}
                    placeholder="0"
                    disabled={onCredit}
                    className={`w-full text-4xl font-bold bg-transparent border-0 focus:outline-none focus:ring-0 p-0 ${
                      onCredit ? "text-gray-400 cursor-not-allowed" : "text-gray-900"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        </WideDialogContent>
      </WideDialog>

      {/* Stock Selection Modal */}
      {productForStockSelection && (
        <StockSelectionModal
          isOpen={isStockModalOpen}
          onClose={() => {
            setIsStockModalOpen(false);
            setProductForStockSelection(null);
          }}
          productId={productForStockSelection.id!}
          productName={productForStockSelection.product_name}
          onStockSelect={handleStockSelect}
        />
      )}

      {/* Client Creation Modal */}
      <WideDialog open={isCreateClientModalOpen} onOpenChange={setIsCreateClientModalOpen}>
        <WideDialogContent className="max-h-[90vh] overflow-auto">
          <WideDialogHeader>
            <WideDialogTitle>Создать клиента</WideDialogTitle>
          </WideDialogHeader>

          <div className="p-6 space-y-4">
            {/* Client Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип клиента *
              </label>
              <Select
                value={newClientData.type}
                onValueChange={(value: 'Физ.лицо' | 'Юр.лицо') => 
                  setNewClientData({ ...newClientData, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Физ.лицо">Физ.лицо</SelectItem>
                  <SelectItem value="Юр.лицо">Юр.лицо</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {newClientData.type === 'Юр.лицо' ? 'Название компании' : 'Имя'} *
              </label>
              <Input
                type="text"
                placeholder={newClientData.type === 'Юр.лицо' ? 'Введите название компании' : 'Введите имя'}
                value={newClientData.name}
                onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                onFocus={(e) => e.stopPropagation()}
                onBlur={(e) => e.stopPropagation()}
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Телефон *
              </label>
              <Input
                type="tel"
                placeholder="+998970953905"
                value={newClientData.phone_number}
                onChange={(e) => {
                  let value = e.target.value.replace(/\D/g, '');
                  if (value.startsWith('998')) value = value.slice(3);
                  value = value.slice(0, 9);
                  setNewClientData({ ...newClientData, phone_number: '+998' + value });
                }}
                onFocus={(e) => e.stopPropagation()}
                onBlur={(e) => e.stopPropagation()}
                maxLength={13}
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Адрес *
              </label>
              <Input
                type="text"
                placeholder="Введите адрес"
                value={newClientData.address}
                onChange={(e) => setNewClientData({ ...newClientData, address: e.target.value })}
                onFocus={(e) => e.stopPropagation()}
                onBlur={(e) => e.stopPropagation()}
              />
            </div>

            {/* Corporate fields */}
            {newClientData.type === 'Юр.лицо' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Имя генерального директора *
                  </label>
                  <Input
                    type="text"
                    placeholder="Введите имя генерального директора"
                    value={newClientData.ceo_name}
                    onChange={(e) => setNewClientData({ ...newClientData, ceo_name: e.target.value })}
                    onFocus={(e) => e.stopPropagation()}
                    onBlur={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Баланс *
                  </label>
                  <Input
                    type="number"
                    placeholder="Введите баланс"
                    value={newClientData.balance}
                    onChange={(e) => setNewClientData({ ...newClientData, balance: Number(e.target.value) })}
                    onFocus={(e) => e.stopPropagation()}
                    onBlur={(e) => e.stopPropagation()}
                  />
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <Button
                onClick={() => {
                  setIsCreateClientModalOpen(false);
                  setNewClientData({
                    type: 'Физ.лицо',
                    name: '',
                    phone_number: '+998',
                    address: '',
                    ceo_name: '',
                    balance: 0,
                  });
                }}
                variant="outline"
                className="flex-1"
              >
                Отмена
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const dataToSubmit = newClientData.type === 'Физ.лицо'
                      ? {
                          type: newClientData.type,
                          name: newClientData.name,
                          phone_number: newClientData.phone_number,
                          address: newClientData.address,
                        }
                      : newClientData;

                    const createdClient = await createClientMutation.mutateAsync(dataToSubmit as any);
                    toast.success('Клиент успешно создан');
                    setSelectedClient(createdClient.id);
                    setIsCreateClientModalOpen(false);
                    setNewClientData({
                      type: 'Физ.лицо',
                      name: '',
                      phone_number: '+998',
                      address: '',
                      ceo_name: '',
                      balance: 0,
                    });
                  } catch (error) {
                    toast.error('Ошибка при создании клиента');
                    console.error('Error creating client:', error);
                  }
                }}
                className="flex-1"
                disabled={!newClientData.name || !newClientData.phone_number || !newClientData.address ||
                  (newClientData.type === 'Юр.лицо' && (!newClientData.ceo_name || newClientData.balance === undefined))}
              >
                Создать
              </Button>
            </div>
          </div>
        </WideDialogContent>
      </WideDialog>
    </div>
  );
};

// Wrapper component that handles the shift check
const POSInterface = () => {
  const { data: userData } = useCurrentUser();

  // Early return before rendering main component
  if (!userData?.has_active_shift) {
    return <OpenShiftForm />;
  }

  return <POSInterfaceCore />;
};

export default POSInterface;
